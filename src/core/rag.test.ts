import { describe, expect, it } from "vitest";
import { buildRagContext, estimateTokens, parseCitationIds, retrieveTopK } from "./rag";
import type { Chunk } from "./index";
import { VectorStore } from "./vectorStore";

function chunk(id: string, text: string, heading = ""): Chunk {
  return { id, path: `${id}.md`, heading, text };
}

function storeOf(vectors: Record<string, number[]>): VectorStore {
  const s = new VectorStore();
  for (const [k, v] of Object.entries(vectors)) s.upsert(k, v);
  return s;
}

describe("retrieveTopK", () => {
  it("按相似度降序，topK 截断，threshold 过滤", () => {
    // b 与查询方向差 45°，余弦 ≈0.707，用来卡阈值
    const store = storeOf({
      a: [1, 0],
      b: [0.5, 0.5],
      c: [0, 1],
    });
    const hits = retrieveTopK([1, 0], store, { topK: 2, threshold: 0.5 });
    expect(hits.map((h) => h.id)).toEqual(["a", "b"]);
    expect(hits[0]?.score).toBeCloseTo(1, 5);

    const only = retrieveTopK([1, 0], store, { topK: 10, threshold: 0.9 });
    expect(only.map((h) => h.id)).toEqual(["a"]);
  });

  it("空库 → 空结果", () => {
    expect(retrieveTopK([1, 0], new VectorStore(), { topK: 5 })).toEqual([]);
  });
});

describe("buildRagContext", () => {
  const chunks = [chunk("a", "关于注意力的论述"), chunk("b", "关于睡眠的论述")];
  const hits = [
    { id: "a", score: 0.9 },
    { id: "b", score: 0.8 },
  ];

  it("编号从 [1] 开始，含标题路径", () => {
    const ctx = buildRagContext(chunks, hits);
    expect(ctx.prompt).toContain("[1]");
    expect(ctx.prompt).toContain("[2]");
    expect(ctx.prompt).toContain("a.md");
    expect(ctx.citations.map((c) => c.chunkId)).toEqual(["a", "b"]);
    expect(ctx.citations.map((c) => c.index)).toEqual([1, 2]);
  });

  it("预算内放不下就停，但至少保留第一条", () => {
    const ctx = buildRagContext(chunks, hits, { budgetTokens: 6 });
    expect(ctx.citations).toHaveLength(1);
  });

  it("空命中 → 空 prompt 与空 citations", () => {
    const ctx = buildRagContext(chunks, []);
    expect(ctx.prompt).toBe("");
    expect(ctx.citations).toEqual([]);
  });

  it("命中指向不存在的 chunk 时跳过", () => {
    const ctx = buildRagContext([chunk("a", "x")], [{ id: "ghost", score: 0.99 }]);
    expect(ctx.citations).toEqual([]);
    expect(ctx.prompt).toBe("");
  });
});

describe("parseCitationIds", () => {
  it("提取 [n] 编号：去重、升序、限 1-2 位", () => {
    expect(parseCitationIds("结论见 [2] 和 [1]，另外 [10] 也行，但 [100] 不算")).toEqual([1, 2, 10]);
    expect(parseCitationIds("[3][3][1]")).toEqual([1, 3]);
    expect(parseCitationIds("没有引用 [注]")).toEqual([]);
  });
});

describe("estimateTokens", () => {
  it("按 2 字符 ≈ 1 token 向上取整", () => {
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateTokens("abcde")).toBe(3);
  });
});
