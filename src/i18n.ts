/**
 * 灵犀 Lingxi — i18n 双语词典与切换器
 * 硬约定：zh / en 两个字典的 key 集合必须完全一致（有单测强制校验）。
 * 插值语法：{name}，如 t("chat.citationsCount", { n: 3 })
 */

export type Lang = "zh" | "en";
export type LangMode = Lang | "auto";

const zh: Record<string, string> = {
  "app.name": "灵犀 Lingxi",
  "ribbon.tooltip": "打开灵犀侧边栏",
  "cmd.openSidebar": "打开灵犀侧边栏",
  "cmd.askSelection": "问灵犀：选中文字",
  "cmd.summarizeNote": "灵犀：理解当前笔记",

  "view.title": "灵犀 Lingxi",
  "view.switchLang": "Switch to English",
  "view.openSettings": "打开设置",

  "tab.chat": "对话",
  "tab.organize": "整理",
  "tab.integrate": "整合",
  "tab.organize.soon": "整理功能（相关笔记 / 标签 / MOC / 重复检测）稍后上线",
  "tab.integrate.soon": "整合功能（多篇对比 / 主题合并 / 知识缺口）稍后上线",

  "chat.placeholder": "问点什么…例如「我关于注意力的笔记都说了什么」",
  "chat.send": "发送",
  "chat.thinking": "思考中…",
  "chat.failed": "请求失败",
  "chat.you": "你",
  "chat.lingxi": "灵犀",
  "chat.citations": "引用来源",
  "chat.noCitation": "（本次回答未引用笔记）",
  "chat.retry": "重试",
  "chat.stop": "停止",

  "context.label": "上下文范围",
  "context.vault": "全库检索",
  "context.note": "当前笔记",
  "context.selection": "选中内容",

  "settings.title": "灵犀 Lingxi",
  "settings.language": "界面语言",
  "settings.language.auto": "跟随 Obsidian",
  "settings.language.zh": "中文",
  "settings.language.en": "English",
  "settings.connection": "模型接入（OpenAI 兼容 /v1）",
  "settings.baseUrl": "接口地址",
  "settings.baseUrl.desc": "默认学校网关；任何 OpenAI 兼容端点均可",
  "settings.apiKey": "API Key",
  "settings.apiKey.desc": "仅保存在本机 data.json，不进 git、不上传",
  "settings.chatModel": "对话模型",
  "settings.embeddingModel": "向量模型",
  "settings.testConnection": "测试连接",
  "settings.test.ok": "连接成功：可用模型 {n} 个",
  "settings.test.fail": "连接失败：{msg}",
  "settings.budget": "上下文预算（tokens）",
  "settings.maxInputTokens": "输入上限",
  "settings.maxOutputTokens": "输出上限",
  "settings.topK": "检索条数 Top-K",
  "settings.temperature": "温度",
  "settings.scope": "索引与写入范围",
  "settings.excludeFolders": "排除文件夹（每行一个）",
  "settings.autoFolders": "半自动整理文件夹",
  "settings.autoFolders.desc": "白名单内新笔记可自动打标签/插双链；其余永远只出建议",
  "settings.similarity": "相关度阈值",
  "settings.saveNotice": "设置已保存",

  "err.noApiKey": "请先在设置里填写 API Key",
  "err.emptyQuestion": "先输入问题",
};

const en: Record<string, string> = {
  "app.name": "Lingxi",
  "ribbon.tooltip": "Open Lingxi sidebar",
  "cmd.openSidebar": "Open Lingxi sidebar",
  "cmd.askSelection": "Ask Lingxi about selection",
  "cmd.summarizeNote": "Lingxi: Understand current note",

  "view.title": "Lingxi",
  "view.switchLang": "切换为中文",
  "view.openSettings": "Open settings",

  "tab.chat": "Chat",
  "tab.organize": "Organize",
  "tab.integrate": "Integrate",
  "tab.organize.soon": "Organize tools (related notes / tags / MOC / duplicates) arrive in a later phase",
  "tab.integrate.soon": "Integrate tools (compare / merge / knowledge gaps) arrive in a later phase",

  "chat.placeholder": "Ask something… e.g. “what do my notes on attention say?”",
  "chat.send": "Send",
  "chat.thinking": "Thinking…",
  "chat.failed": "Request failed",
  "chat.you": "You",
  "chat.lingxi": "Lingxi",
  "chat.citations": "Sources",
  "chat.noCitation": "(no note cited in this answer)",
  "chat.retry": "Retry",
  "chat.stop": "Stop",

  "context.label": "Context scope",
  "context.vault": "Whole vault (RAG)",
  "context.note": "Current note",
  "context.selection": "Selection",

  "settings.title": "Lingxi",
  "settings.language": "Interface language",
  "settings.language.auto": "Follow Obsidian",
  "settings.language.zh": "中文",
  "settings.language.en": "English",
  "settings.connection": "Model gateway (OpenAI-compatible /v1)",
  "settings.baseUrl": "Base URL",
  "settings.baseUrl.desc": "Defaults to the campus gateway; any OpenAI-compatible endpoint works",
  "settings.apiKey": "API key",
  "settings.apiKey.desc": "Stored in local data.json only — never in git, never uploaded",
  "settings.chatModel": "Chat model",
  "settings.embeddingModel": "Embedding model",
  "settings.testConnection": "Test connection",
  "settings.test.ok": "Connected: {n} models available",
  "settings.test.fail": "Connection failed: {msg}",
  "settings.budget": "Context budget (tokens)",
  "settings.maxInputTokens": "Max input tokens",
  "settings.maxOutputTokens": "Max output tokens",
  "settings.topK": "Retrieval Top-K",
  "settings.temperature": "Temperature",
  "settings.scope": "Index & write scope",
  "settings.excludeFolders": "Excluded folders (one per line)",
  "settings.autoFolders": "Auto-organize folders",
  "settings.autoFolders.desc": "New notes inside the whitelist may be auto-tagged / auto-linked; everything else stays suggestion-only",
  "settings.similarity": "Similarity threshold",
  "settings.saveNotice": "Settings saved",

  "err.noApiKey": "Set your API key in settings first",
  "err.emptyQuestion": "Type a question first",
};

export const DICT_ZH = zh;
export const DICT_EN = en;

/** 找出两个字典的 key 差集（单测用） */
export function dictKeyDiff(a: Record<string, string>, b: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diff: string[] = [];
  for (const k of keys) {
    if (!(k in a) || !(k in b)) diff.push(k);
  }
  return diff.sort();
}

/** 按 Obsidian  locale 推断语言 */
export function detectLang(obsidianLocale: string | undefined): Lang {
  return obsidianLocale && obsidianLocale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLang(mode: LangMode, obsidianLocale: string | undefined): Lang {
  return mode === "auto" ? detectLang(obsidianLocale) : mode;
}

export class I18n {
  private lang: Lang;
  private dict: Record<string, string>;

  constructor(lang: Lang = "zh") {
    this.lang = lang;
    this.dict = lang === "zh" ? zh : en;
  }

  get current(): Lang {
    return this.lang;
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.dict = lang === "zh" ? zh : en;
  }

  t(key: string, vars?: Record<string, string | number>): string {
    let text = this.dict[key];
    if (text === undefined) {
      // 兜底：另一种语言有就用，并加可见标记，避免界面出现裸 key
      const fallback = (this.lang === "zh" ? en : zh)[key];
      text = fallback === undefined ? `⚠${key}` : fallback;
    }
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  }

  has(key: string): boolean {
    return key in this.dict;
  }
}
