import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, parseFolderList, folderListToText } from "./settings";

describe("mergeSettings", () => {
  it("垃圾输入 / null → 全部回退默认", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("保留合法用户值", () => {
    const s = mergeSettings({
      language: "en",
      chatModel: "qwen3.5-122b-a10b-fp8",
      topK: 12,
      temperature: 0.7,
      excludeFolders: ["日记"],
    });
    expect(s.language).toBe("en");
    expect(s.chatModel).toBe("qwen3.5-122b-a10b-fp8");
    expect(s.topK).toBe(12);
    expect(s.temperature).toBe(0.7);
    expect(s.excludeFolders).toEqual(["日记"]);
  });

  it("baseUrl 去尾斜杠；空串回退默认", () => {
    expect(mergeSettings({ baseUrl: "https://x.com/v1//" }).baseUrl).toBe("https://x.com/v1");
    expect(mergeSettings({ baseUrl: "   " }).baseUrl).toBe(DEFAULT_SETTINGS.baseUrl);
  });

  it("数值钳制：topK 1..20，temperature 0..2，similarity 0..1", () => {
    expect(mergeSettings({ topK: 0 }).topK).toBe(1);
    expect(mergeSettings({ topK: 99 }).topK).toBe(20);
    expect(mergeSettings({ temperature: 5 }).temperature).toBe(2);
    expect(mergeSettings({ temperature: -1 }).temperature).toBe(0);
    expect(mergeSettings({ similarityThreshold: 1.5 }).similarityThreshold).toBe(1);
  });

  it("非法 language / 非数组字段回退默认", () => {
    expect(mergeSettings({ language: "fr" }).language).toBe("auto");
    expect(mergeSettings({ excludeFolders: "日记" }).excludeFolders).toEqual(DEFAULT_SETTINGS.excludeFolders);
  });

  it("apiKey 缺省为空串（绝不预填密钥）", () => {
    expect(mergeSettings(undefined).apiKey).toBe("");
  });

  it("默认值钉死学校网关与实测模型名", () => {
    expect(DEFAULT_SETTINGS.baseUrl).toBe("https://token.nau.edu.cn/v1");
    expect(DEFAULT_SETTINGS.chatModel).toBe("qwen3.8-27b");
    expect(DEFAULT_SETTINGS.embeddingModel).toBe("qwen3-embedding-8b");
  });
});

describe("文件夹列表解析", () => {
  it("去空行、去重、去首尾空格", () => {
    expect(parseFolderList(" 日记 \n\n日记\n随笔\n")).toEqual(["日记", "随笔"]);
  });

  it("空文本 → 空数组", () => {
    expect(parseFolderList("   \n  \n")).toEqual([]);
  });

  it("列表 ↔ 文本往返稳定", () => {
    const list = ["日记", "Inbox"];
    expect(parseFolderList(folderListToText(list))).toEqual(list);
  });
});
