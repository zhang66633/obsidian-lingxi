import { describe, expect, it } from "vitest";
import { NoteIndex, hashText, splitIntoChunks } from "./index";

describe("hashText", () => {
  it("同内容同 hash，内容变 hash 变", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });

  it("带长度后缀，区分内容与长度", () => {
    expect(hashText("ab")).toContain(":2");
  });
});

describe("splitIntoChunks", () => {
  it("按标题切块并记录标题路径", () => {
    const md = ["前言内容", "", "# 第一章", "内容A", "", "## 小节", "内容B"].join("\n");
    const chunks = splitIntoChunks("n.md", md);
    expect(chunks.length).toBe(3);
    expect(chunks[0]?.heading).toBe("");
    expect(chunks[0]?.text).toContain("前言内容");
    expect(chunks[1]?.heading).toBe("第一章");
    expect(chunks[2]?.heading).toBe("第一章 / 小节");
  });

  it("切块不丢内容：所有 chunk 文本拼回等于原文（去空白）", () => {
    const md = ["# A", "甲".repeat(2000), "", "# B", "乙".repeat(150)].join("\n");
    const chunks = splitIntoChunks("n.md", md, { maxChars: 1000 });
    const joined = chunks.map((c) => c.text).join("");
    expect(joined).toContain("甲".repeat(2000));
    expect(joined).toContain("乙".repeat(150));
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
  });

  it("无标题超长区间：空行强制分段 + 超长段硬切分，内容不丢", () => {
    const md = ["a".repeat(600), "", "b".repeat(600)].join("\n");
    const chunks = splitIntoChunks("n.md", md, { maxChars: 500 });
    expect(chunks.every((c) => c.text.length <= 500)).toBe(true);
    // 600>500 的两段各被硬切成 2 块
    expect(chunks.length).toBe(4);
    expect(chunks.map((c) => c.text).join("")).toBe("a".repeat(600) + "b".repeat(600));
  });

  it("单行超长走硬切分，且不产生空 chunk", () => {
    const md = "x".repeat(2500);
    const chunks = splitIntoChunks("n.md", md, { maxChars: 1000 });
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
    expect(chunks.map((c) => c.text).join("")).toBe(md);
  });

  it("空文档 → 空 chunks", () => {
    expect(splitIntoChunks("n.md", "\n\n")).toEqual([]);
  });
});

describe("NoteIndex 增量同步", () => {
  const fileA = { path: "a.md", mtime: 100, content: "# 标题\n内容一" };
  const fileB = { path: "b.md", mtime: 200, content: "# 另一篇\n内容二" };

  it("首次全部 added", () => {
    const idx = new NoteIndex();
    const r = idx.sync([fileA, fileB]);
    expect(r.added.sort()).toEqual(["a.md", "b.md"]);
    expect(r.unchanged).toBe(0);
    expect(idx.allChunks().length).toBe(2);
  });

  it("原样再同步 → unchanged，不重复切块", () => {
    const idx = new NoteIndex();
    idx.sync([fileA, fileB]);
    const r = idx.sync([fileA, fileB]);
    expect(r.unchanged).toBe(2);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(idx.allChunks().length).toBe(2);
  });

  it("mtime 不变但内容变 → updated（hash 兜底）", () => {
    const idx = new NoteIndex();
    idx.sync([fileA]);
    const r = idx.sync([{ ...fileA, content: "# 标题\n新内容" }]);
    expect(r.updated).toEqual(["a.md"]);
    expect(idx.allChunks()[0]?.text).toContain("新内容");
  });

  it("文件消失 → removed，chunk 一并清理", () => {
    const idx = new NoteIndex();
    idx.sync([fileA, fileB]);
    const r = idx.sync([fileA]);
    expect(r.removed).toEqual(["b.md"]);
    expect(idx.notePaths()).toEqual(["a.md"]);
    expect(idx.allChunks().every((c) => c.path === "a.md")).toBe(true);
  });

  it("改文件后旧 chunk id 不残留（chunkIdsOf 与 allChunks 一致）", () => {
    const idx = new NoteIndex();
    idx.sync([fileA]);
    idx.sync([{ ...fileA, content: "# 一\n甲\n\n# 二\n乙" }]);
    const ids = idx.chunkIdsOf("a.md");
    expect(idx.allChunks().map((c) => c.id).sort()).toEqual([...ids].sort());
  });

  it("removePath / JSON 往返", () => {
    const idx = new NoteIndex();
    idx.sync([fileA, fileB]);
    idx.removePath("a.md");
    expect(idx.notePaths()).toEqual(["b.md"]);
    const restored = NoteIndex.fromJSON(JSON.parse(JSON.stringify(idx.toJSON())));
    expect(restored.notePaths()).toEqual(["b.md"]);
    expect(restored.allChunks()).toEqual(idx.allChunks());
    expect(restored.getChunk(idx.chunkIdsOf("b.md")[0] ?? "")?.text).toContain("内容二");
  });

  it("chunksByIds 跳过不存在的 id", () => {
    const idx = new NoteIndex();
    idx.sync([fileA]);
    expect(idx.chunksByIds(["nope"])).toEqual([]);
  });
});
