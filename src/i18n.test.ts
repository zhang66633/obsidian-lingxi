import { describe, expect, it } from "vitest";
import { I18n, DICT_ZH, DICT_EN, dictKeyDiff, detectLang, resolveLang } from "./i18n";

describe("i18n 词典一致性（双语硬约定）", () => {
  it("zh / en key 集合必须完全相同", () => {
    expect(dictKeyDiff(DICT_ZH, DICT_EN)).toEqual([]);
  });

  it("不允许出现空文案", () => {
    for (const [k, v] of Object.entries(DICT_ZH)) {
      expect(v.trim(), `zh key ${k} 为空`).not.toBe("");
    }
    for (const [k, v] of Object.entries(DICT_EN)) {
      expect(v.trim(), `en key ${k} 为空`).not.toBe("");
    }
  });
});

describe("I18n", () => {
  it("插值 {n} 正常工作", () => {
    const i18n = new I18n("zh");
    expect(i18n.t("settings.test.ok", { n: 5 })).toContain("5");
  });

  it("缺 key 时回退另一种语言并带可见标记", () => {
    const i18n = new I18n("zh");
    expect(i18n.t("no.such.key")).toBe("⚠no.such.key");
    expect(i18n.has("no.such.key")).toBe(false);
  });

  it("setLang 切换后取到对应语言文案", () => {
    const i18n = new I18n("zh");
    expect(i18n.t("tab.chat")).toBe("对话");
    i18n.setLang("en");
    expect(i18n.t("tab.chat")).toBe("Chat");
    expect(i18n.current).toBe("en");
  });
});

describe("语言探测", () => {
  it("detectLang：zh 开头 → zh，其余 → en", () => {
    expect(detectLang("zh-CN")).toBe("zh");
    expect(detectLang("zh")).toBe("zh");
    expect(detectLang("en-US")).toBe("en");
    expect(detectLang(undefined)).toBe("en");
  });

  it("resolveLang：auto 走探测，固定值优先", () => {
    expect(resolveLang("auto", "zh-CN")).toBe("zh");
    expect(resolveLang("en", "zh-CN")).toBe("en");
    expect(resolveLang("zh", "en-US")).toBe("zh");
  });
});
