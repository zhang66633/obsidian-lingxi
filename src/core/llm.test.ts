import { describe, expect, it } from "vitest";
import {
  LlmError,
  buildChatBody,
  buildChatUrl,
  buildEmbedBody,
  buildEmbedUrl,
  buildHeaders,
  chatCompletion,
  embedTexts,
  joinUrl,
  parseChatContent,
  parseEmbeddings,
} from "./llm";
import type { Transport } from "./llm";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeTransport(status: number, json: unknown): { transport: Transport; calls: Call[] } {
  const calls: Call[] = [];
  const transport: Transport = {
    async postJson(url, headers, body) {
      calls.push({ url, headers, body });
      return { status, ok: status >= 200 && status < 300, json };
    },
  };
  return { transport, calls };
}

const cfg = { baseUrl: "https://gw.example.com/v1", apiKey: "sk-test", chatModel: "qwen3.8-27b" };
const embedCfg = { baseUrl: "https://gw.example.com/v1", apiKey: "sk-test", embeddingModel: "qwen3-embedding-8b" };

describe("URL 与请求构造", () => {
  it("joinUrl 去掉尾部斜杠再拼接", () => {
    expect(joinUrl("https://gw.example.com/v1///", "/chat/completions")).toBe(
      "https://gw.example.com/v1/chat/completions",
    );
    expect(buildChatUrl(cfg.baseUrl)).toBe("https://gw.example.com/v1/chat/completions");
    expect(buildEmbedUrl(cfg.baseUrl)).toBe("https://gw.example.com/v1/embeddings");
  });

  it("buildHeaders：无 key 不带 Authorization，有 key 带 Bearer", () => {
    expect(buildHeaders("")).not.toHaveProperty("Authorization");
    expect(buildHeaders("  sk-abc ")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-abc",
    });
  });

  it("buildChatBody：stream=false，max_tokens 透传", () => {
    const body = buildChatBody("m", [{ role: "user", content: "hi" }], {
      temperature: 0.3,
      maxTokens: 8192,
    }) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8192);
    expect(body.temperature).toBe(0.3);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("buildEmbedBody：input 为数组", () => {
    expect(buildEmbedBody("e", ["a", "b"])).toEqual({ model: "e", input: ["a", "b"] });
  });
});

describe("parseChatContent", () => {
  it("正常提取 assistant 文本", () => {
    expect(parseChatContent({ choices: [{ message: { content: "答案" } }] })).toBe("答案");
  });

  it("网关错误 payload → 抛 LlmError 且带 message", () => {
    expect(() => parseChatContent({ error: { message: "invalid api key" } })).toThrow(LlmError);
    try {
      parseChatContent({ error: { message: "invalid api key" } });
    } catch (e) {
      expect((e as LlmError).message).toBe("invalid api key");
    }
  });

  it("推理模型 max_tokens 耗尽（content:null）必须显式报错，不静默返回空", () => {
    expect(() => parseChatContent({ choices: [{ message: { content: null }, finish_reason: "length" }] })).toThrow(
      /finish_reason: length/,
    );
  });

  it("空对象/空 choices 报错", () => {
    expect(() => parseChatContent({})).toThrow(LlmError);
    expect(() => parseChatContent({ choices: [] })).toThrow(LlmError);
  });
});

describe("parseEmbeddings", () => {
  it("按 index 排序返回", () => {
    const out = parseEmbeddings({
      data: [
        { index: 1, embedding: [1, 1] },
        { index: 0, embedding: [0, 0] },
      ],
    });
    expect(out).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("维度不一致报错", () => {
    expect(() =>
      parseEmbeddings({
        data: [
          { index: 0, embedding: [0, 0] },
          { index: 1, embedding: [1] },
        ],
      }),
    ).toThrow(LlmError);
  });

  it("空 data / error payload 报错", () => {
    expect(() => parseEmbeddings({ data: [] })).toThrow(LlmError);
    expect(() => parseEmbeddings({ error: { message: "quota" } })).toThrow(/quota/);
  });
});

describe("chatCompletion / embedTexts（fake transport）", () => {
  it("成功：返回文本，URL/头/体正确", async () => {
    const { transport, calls } = fakeTransport(200, {
      choices: [{ message: { content: "你好" } }],
    });
    const out = await chatCompletion(transport, cfg, [{ role: "user", content: "hi" }], {
      temperature: 0.3,
      maxTokens: 8192,
    });
    expect(out).toBe("你好");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://gw.example.com/v1/chat/completions");
    expect(calls[0]?.headers.Authorization).toBe("Bearer sk-test");
    expect((calls[0]?.body as { max_tokens: number }).max_tokens).toBe(8192);
  });

  it("401：抛 LlmError，状态码与详情保留", async () => {
    const { transport } = fakeTransport(401, { error: { message: "invalid api key" } });
    await expect(chatCompletion(transport, cfg, [{ role: "user", content: "hi" }])).rejects.toThrow(LlmError);
    try {
      await chatCompletion(transport, cfg, [{ role: "user", content: "hi" }]);
    } catch (e) {
      expect((e as LlmError).status).toBe(401);
      expect((e as LlmError).message).toBe("invalid api key");
    }
  });

  it("embeddings：多文本一次请求，按输入顺序返回", async () => {
    const { transport, calls } = fakeTransport(200, {
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] },
      ],
    });
    const out = await embedTexts(transport, embedCfg, ["甲", "乙"]);
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(calls[0]?.url).toBe("https://gw.example.com/v1/embeddings");
  });

  it("embeddings：空输入不发请求", async () => {
    const { transport, calls } = fakeTransport(200, { data: [] });
    const out = await embedTexts(transport, embedCfg, []);
    expect(out).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
