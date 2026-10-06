import { describe, expect, it } from "vitest";
import { VectorStore, cosineSimilarity, fromBase64F32, toBase64F32 } from "./vectorStore";

describe("base64(Float32) 编解码", () => {
  it("往返保持数值（f32 精度内）", () => {
    const v = [0.1, -0.25, 0.333333, 1, 0, -1];
    const back = fromBase64F32(toBase64F32(v));
    expect(back).toHaveLength(v.length);
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i] ?? 0, 5));
  });

  it("4096 维大向量往返（分块 fromCharCode 不爆栈）", () => {
    const v = Array.from({ length: 4096 }, (_, i) => Math.sin(i) * 0.5);
    expect(fromBase64F32(toBase64F32(v))).toHaveLength(4096);
  });
});

describe("cosineSimilarity", () => {
  it("相同=1，正交=0，相反=-1，零向量=0", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe("VectorStore", () => {
  it("ensureModel：同模型 false，换模型清空并 true", () => {
    const s = new VectorStore();
    expect(s.ensureModel("m1", 4)).toBe(true); // 首次也作废（从空开始）
    s.upsert("a", [1, 0, 0, 0]);
    expect(s.ensureModel("m1", 4)).toBe(false);
    expect(s.ensureModel("m2", 4)).toBe(true);
    expect(s.size).toBe(0);
  });

  it("upsert/remove/has/get/pruneTo", () => {
    const s = new VectorStore();
    s.upsert("a", [1, 0]);
    s.upsert("b", [0, 1]);
    expect(s.has("a")).toBe(true);
    s.remove("a");
    expect(s.has("a")).toBe(false);
    expect(s.get("b")).toEqual([0, 1]);
    s.upsert("c", [1, 1]);
    expect(s.pruneTo(new Set(["b"]))).toBe(1);
    expect(s.size).toBe(1);
  });

  it("JSON 往返保留 model/dim/向量", () => {
    const s = new VectorStore();
    s.ensureModel("emb-8b", 2);
    s.upsert("a", [0.5, -0.5]);
    const restored = VectorStore.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(restored.has("a")).toBe(true);
    expect(restored.get("a")?.[0]).toBeCloseTo(0.5, 5);
    expect(restored.ensureModel("emb-8b", 2)).toBe(false);
  });

  it("损坏的单条 base64 不拖垮整体加载", () => {
    const restored = VectorStore.fromJSON({ model: "m", dim: 2, vectors: { bad: "!!!not-base64!!!", ok: toBase64F32([1, 2]) } });
    expect(restored.has("bad")).toBe(false);
    expect(restored.has("ok")).toBe(true);
  });
});
