import { describe, expect, it } from "vitest";
import { VaultIndexer, isExcluded } from "./vaultIndexer";
import type { NoteFile, VaultPort } from "./vaultIndexer";
import type { Transport } from "./llm";

/** 假库 + 假网关：记录每次 embedding 调用，验证增量行为 */
class FakePort implements VaultPort {
  files: NoteFile[] = [];
  contents = new Map<string, string>();
  cache: string | null = null;
  cacheWrites = 0;

  listMarkdownFiles(): NoteFile[] {
    return this.files;
  }
  async readNote(path: string): Promise<string> {
    return this.contents.get(path) ?? "";
  }
  async readCache(): Promise<string | null> {
    return this.cache;
  }
  async writeCache(json: string): Promise<void> {
    this.cache = json;
    this.cacheWrites++;
  }
}

function makeTransport(): Transport & { embedCalls: number; chatCalls: number } {
  const t = {
    embedCalls: 0,
    chatCalls: 0,
    async postJson(url, _headers, body) {
      if (String(url).endsWith("/embeddings")) {
        t.embedCalls++;
        const input = (body as { input: string[] }).input;
        return {
          status: 200,
          ok: true,
          json: {
            data: input.map((text, i) => ({
              index: i,
              embedding: [(text.length % 97) / 97, 0.5],
            })),
          },
        };
      }
      t.chatCalls++;
      return { status: 200, ok: true, json: { choices: [{ message: { content: "ok" } }] } };
    },
  };
  return t as Transport & { embedCalls: number; chatCalls: number };
}

function baseCfg() {
  return {
    baseUrl: "https://gw/v1",
    apiKey: "sk",
    embeddingModel: "emb-8b",
    excludeFolders: [".obsidian", "模板"],
    topK: 3,
    similarityThreshold: 0.5,
    contextBudgetTokens: 1000,
  };
}

function seed(port: FakePort, path: string, mtime: number, content: string): void {
  port.files.push({ path, mtime });
  port.contents.set(path, content);
}

describe("isExcluded", () => {
  it("文件夹本身与子路径都排除；空串不排除", () => {
    expect(isExcluded(".obsidian/x.md", [".obsidian"])).toBe(true);
    expect(isExcluded(".obsidian", [".obsidian"])).toBe(true);
    expect(isExcluded("日记/a.md", [".obsidian", "模板"])).toBe(false);
    expect(isExcluded("日记/a.md", ["日记/"])).toBe(true);
    expect(isExcluded("a.md", [""])).toBe(false);
  });
});

describe("VaultIndexer 全链路（mock 网关）", () => {
  it("首建：全部切块→全部 embedding→写缓存", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    seed(port, "模板/x.md", 1, "模板不该进索引");
    const t = makeTransport();
    const idx = new VaultIndexer(port, baseCfg(), t);

    const stats = await idx.syncAll();
    expect(stats.files).toBe(1); // 排除文件夹命中
    expect(stats.chunks).toBe(1);
    expect(stats.vectors).toBe(1);
    expect(stats.embeddedNow).toBe(1);
    expect(port.cacheWrites).toBe(1);
    expect(t.embedCalls).toBe(1); // 1 篇 → 1 批
  });

  it("二次同步：无变化 → 0 次 embedding（缓存全命中）", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    const t = makeTransport();
    const idx = new VaultIndexer(port, baseCfg(), t);
    await idx.syncAll();

    t.embedCalls = 0;
    const stats = await idx.syncAll();
    expect(stats.embeddedNow).toBe(0);
    expect(t.embedCalls).toBe(0);
  });

  it("改一篇：只重算该篇的 embedding，旧向量被清", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    seed(port, "b.md", 1, "# 另一篇\n关于睡眠的内容");
    const t = makeTransport();
    const idx = new VaultIndexer(port, baseCfg(), t);
    await idx.syncAll();

    // 改 a.md：一个标题区间变成一个两区间 → 2 chunks
    port.contents.set("a.md", "# 标题\n改过的内容\n\n## 小节\n更多内容");
    port.files[0]!.mtime = 2;
    t.embedCalls = 0;
    const stats = await idx.syncAll();
    expect(stats.embeddedNow).toBe(2);
    expect(stats.vectors).toBe(3); // a 的 2 + b 的 1
    expect(t.embedCalls).toBe(1); // 2 个 chunk 一批搞定
  });

  it("回归：chunk id 复用后，旧向量必须被替换（防陈旧命中）", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    const idx = new VaultIndexer(port, baseCfg(), makeTransport());
    await idx.syncAll();
    const idA = idx.index.chunkIdsOf("a.md")[0]!;
    expect(idA).toBe("a.md#0");
    const oldVec = idx.store.get(idA)!;
    expect(oldVec[0]).toBeCloseTo(("# 标题\n关于注意力的内容".length % 97) / 97, 5);

    // 新内容同样以 a.md#0 开头（id 复用），但文本长度不同
    port.contents.set("a.md", "# 标题\n完全不同的新内容，长度也不一样");
    port.files[0]!.mtime = 2;
    await idx.syncAll();
    const newVec = idx.store.get(idA)!;
    expect(newVec[0]).toBeCloseTo(("# 标题\n完全不同的新内容，长度也不一样".length % 97) / 97, 5);
    expect(newVec[0]).not.toBeCloseTo(oldVec[0], 5);
  });

  it("删文件：向量与 chunk 一并消失", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# A\n甲");
    seed(port, "b.md", 1, "# B\n乙");
    const idx = new VaultIndexer(port, baseCfg(), makeTransport());
    await idx.syncAll();
    port.files = port.files.filter((f) => f.path !== "b.md");
    const stats = await idx.syncAll();
    expect(stats.files).toBe(1);
    expect(stats.vectors).toBe(1);
    expect(idx.index.chunkIdsOf("b.md")).toEqual([]);
  });

  it("缓存断点续建：新实例读缓存后 0 次 embedding", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    const t1 = makeTransport();
    await new VaultIndexer(port, baseCfg(), t1).syncAll();

    const t2 = makeTransport();
    const idx2 = new VaultIndexer(port, baseCfg(), t2);
    expect(await idx2.loadCache()).toBe(true);
    const stats = await idx2.syncAll();
    expect(stats.embeddedNow).toBe(0);
    expect(t2.embedCalls).toBe(0);
    expect(stats.vectors).toBe(1);
  });

  it("换 embedding 模型：缓存作废，全量重建", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    await new VaultIndexer(port, baseCfg(), makeTransport()).syncAll();

    const idx = new VaultIndexer(port, { ...baseCfg(), embeddingModel: "other-emb" }, makeTransport());
    expect(await idx.loadCache()).toBe(false);
    const stats = await idx.syncAll();
    expect(stats.embeddedNow).toBe(1);
  });

  it("检索：命中→上下文带 [1] 编号；空库→空 citations", async () => {
    const port = new FakePort();
    seed(port, "a.md", 1, "# 标题\n关于注意力的内容");
    const idx = new VaultIndexer(port, baseCfg(), makeTransport());
    await idx.syncAll();

    const { hits, context } = await idx.retrieve("注意力");
    expect(hits.length).toBeGreaterThan(0);
    expect(context.prompt).toContain("[1]");
    expect(context.prompt).toContain("a.md");
    expect(context.citations[0]?.chunkId).toBe(idx.index.chunkIdsOf("a.md")[0]);

    const empty = new VaultIndexer(new FakePort(), baseCfg(), makeTransport());
    const r2 = await empty.retrieve("任意");
    expect(r2.hits).toEqual([]);
    expect(r2.context.prompt).toBe("");
  });

  it("空库短路：retrieve 不发 embedding 请求", async () => {
    const port = new FakePort();
    const t = makeTransport();
    const idx = new VaultIndexer(port, baseCfg(), t);
    await idx.retrieve("任意");
    expect(t.embedCalls).toBe(0);
  });
});
