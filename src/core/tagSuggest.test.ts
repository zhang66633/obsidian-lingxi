import { describe, expect, it } from "vitest";
import { buildTagSystemPrompt, buildTagUserPrompt, extractTagVocabulary, parseTagSuggestions } from "./tagSuggest";

describe("extractTagVocabulary", () => {
  it("按词频统计，中文/英文/路径标签都认", () => {
    const vocab = extractTagVocabulary([
      "标题 #注意力 和 #学习方法",
      "又提到 #注意力，还有 #ai/rag",
      "#学习方法 #未标签",
      "不是 #tag 的行内 #tag",
    ]);
    const map = Object.fromEntries(vocab.map((v) => [v.tag, v.count]));
    expect(map["注意力"]).toBe(2);
    expect(map["学习方法"]).toBe(2);
    expect(map["tag"]).toBe(2);
    expect(map["ai/rag"]).toBe(1);
    expect(vocab.length).toBeLessThanOrEqual(60);
  });
});

describe("buildTagUserPrompt", () => {
  it("中英提示都带词表、限量、截断长文", () => {
    const long = "x".repeat(20000);
    const zh = buildTagUserPrompt(long, ["注意力"], 5, "zh");
    expect(zh).toContain("注意力");
    expect(zh).toContain("最多 5 个");
    expect(zh).toContain("JSON");
    expect(zh.length).toBeLessThan(13000); // 长文被截断
    const en = buildTagUserPrompt("note", ["focus"], 3, "en");
    expect(en).toContain("focus");
    expect(en).toContain("at most 3");
  });

  it("空词表时不尬吹「已有标签」", () => {
    expect(buildTagUserPrompt("n", [], 5, "zh")).toContain("暂无既有标签");
    expect(buildTagUserPrompt("n", [], 5, "en")).toContain("No existing tags");
  });

  it("系统提示强调只输出 JSON 数组", () => {
    expect(buildTagSystemPrompt("zh")).toContain("JSON");
    expect(buildTagSystemPrompt("en")).toContain("JSON");
  });
});

describe("parseTagSuggestions", () => {
  it("裸数组 / 围栏 / 散文里的数组都能捞", () => {
    expect(parseTagSuggestions('["a","b"]')).toEqual(["a", "b"]);
    expect(parseTagSuggestions('好的：\n```json\n["x","y"]\n```')).toEqual(["x", "y"]);
    expect(parseTagSuggestions("我认为 [] 不对，正确的是 [\"注意力\",\"专注\"]")).toEqual(["注意力", "专注"]);
  });

  it("过滤：去 # 前缀、去重、限量、非字符串丢弃", () => {
    expect(parseTagSuggestions('["#a","a","b",42,"", "very' + "x".repeat(50) + '"]', { maxTags: 2 })).toEqual(["a", "b"]);
  });

  it("没有数组 → 空", () => {
    expect(parseTagSuggestions("没有标签。")).toEqual([]);
    expect(parseTagSuggestions("[broken")).toEqual([]);
    expect(parseTagSuggestions("{'not':'array'}")).toEqual([]);
  });
});
