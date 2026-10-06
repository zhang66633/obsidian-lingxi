import { describe, expect, it } from "vitest";
import {
  buildComparePrompt,
  buildGapPrompt,
  buildMergePrompt,
  parseCompareResult,
  parseGapResult,
  parseMergeDraft,
  runCompare,
  runGaps,
  runMerge,
} from "./insight";
import type { Transport } from "./llm";

const cfg = { baseUrl: "https://gw/v1", apiKey: "sk", chatModel: "qwen3.8-27b", language: "zh" as const };
const notes = [
  { path: "a.md", text: "甲说注意力有限" },
  { path: "b.md", text: "乙说注意力可训练" },
];

function fakeChat(content: string): Transport {
  return {
    async postJson(_url, _headers, body) {
      const last = (body as { messages: Array<{ content: string }> }).messages.at(-1)?.content ?? "";
      last.length; // 提示词已被构造
      return { status: 200, ok: true, json: { choices: [{ message: { content } }] } };
    },
  };
}

describe("构建提示词", () => {
  it("比较提示含全部笔记路径+截断", () => {
    const long = "x".repeat(9000);
    const p = buildComparePrompt([{ path: "a.md", text: long }], "zh");
    expect(p).toContain("a.md");
    expect(p.length).toBeLessThan(4200); // 单篇截断到 4000
    expect(buildComparePrompt(notes, "en")).toContain("consensus");
    expect(buildComparePrompt(notes, "zh")).toContain("共识");
  });

  it("合并提示可带主题、要求来源标注", () => {
    const p = buildMergePrompt(notes, "注意力", "zh");
    expect(p).toContain("注意力");
    expect(p).toContain("来源");
    expect(buildMergePrompt(notes, undefined, "en")).toContain("source");
  });

  it("缺口提示含问题与上下文", () => {
    const p = buildGapPrompt("怎么训练注意力？", "片段一", "zh");
    expect(p).toContain("怎么训练注意力？");
    expect(p).toContain("片段一");
  });
});

describe("解析", () => {
  it("比较：围栏/散文里的 JSON 都认，缺字段给空数组", () => {
    expect(parseCompareResult('```json\n{"consensus":["c1"],"divergence":["d1"],"complementary":["p1"]}\n```')).toEqual({
      consensus: ["c1"],
      divergence: ["d1"],
      complementary: ["p1"],
    });
    const partial = parseCompareResult("分析如下：{\"consensus\":[\"c\"]}");
    expect(partial).toEqual({ consensus: ["c"], divergence: [], complementary: [] });
    expect(parseCompareResult("没有 JSON")).toEqual({ consensus: [], divergence: [], complementary: [] });
    expect(parseCompareResult('{"consensus":"不是数组"}').consensus).toEqual([]);
  });

  it("合并草稿：非空直出，空串防空", () => {
    expect(parseMergeDraft("  # 草稿  ")).toBe("# 草稿");
    expect(parseMergeDraft("   ")).toBe("");
  });

  it("缺口：解析 gaps/nextSteps，坏输入不崩", () => {
    expect(parseGapResult('{"gaps":["缺实验"],"nextSteps":["读论文"]}')).toEqual({
      gaps: ["缺实验"],
      nextSteps: ["读论文"],
    });
    expect(parseGapResult("[1,2,3]")).toEqual({ gaps: [], nextSteps: [] });
  });
});

describe("编排（fake transport）", () => {
  it("runCompare：走 chat/completions 并解析", async () => {
    const r = await runCompare(fakeChat('{"consensus":["都认为注意力重要"],"divergence":[],"complementary":[]}'), cfg, notes);
    expect(r.consensus).toEqual(["都认为注意力重要"]);
  });

  it("runMerge：返回草稿正文", async () => {
    const r = await runMerge(fakeChat("# 合并草稿\n内容"), cfg, notes, "主题");
    expect(r).toContain("合并草稿");
  });

  it("runGaps：返回缺口与下一步", async () => {
    const r = await runGaps(fakeChat('{"gaps":["缺数据"],"nextSteps":["做实验"]}'), cfg, "问题", "上下文");
    expect(r).toEqual({ gaps: ["缺数据"], nextSteps: ["做实验"] });
  });

  it("模型胡言乱语 → 空结构而非崩溃", async () => {
    const r = await runCompare(fakeChat("我不会输出 JSON"), cfg, notes);
    expect(r).toEqual({ consensus: [], divergence: [], complementary: [] });
  });
});
