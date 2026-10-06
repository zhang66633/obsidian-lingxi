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
  "settings.contextBudget": "RAG 上下文预算",
  "settings.contextBudget.desc": "检索片段最多占多少 token（1000–60000），超出按分数舍弃",
  "settings.saveNotice": "设置已保存",
  "settings.autoOpen": "启动时自动打开侧边栏（调试）",
  "err.noApiKey": "请先在设置里填写 API Key",
  "err.emptyQuestion": "先输入问题",

  "rag.indexing": "正在建立索引 {done}/{total}…",
  "rag.indexReady": "索引就绪：{files} 篇 · {chunks} 块",
  "rag.indexEmpty": "索引为空：请先在设置填写 API Key，并检查排除文件夹。",
  "rag.rebuilding": "正在重建索引…",
  "rag.noHits": "库里没找到足够相关的片段，本次回答未引用笔记。",
  "rag.openSource": "打开来源",
  "rag.context.prefix": "以下是与问题相关的笔记片段（回答请用 [编号] 标注引用来源；没有合适片段就直说）：",
  "rag.firstRunHint": "灵犀已就绪。全库问答前先建一次索引：命令面板 → 重建灵犀索引。",
  "cmd.reindex": "重建灵犀索引",

  "organize.related": "相关笔记",
  "organize.related.hint": "基于当前笔记的语义匹配（需要先建索引）",
  "organize.related.run": "找相关笔记",
  "organize.related.none": "没有找到足够相关的笔记",
  "organize.related.insert": "插入链接",
  "organize.search": "语义搜索",
  "organize.search.hint": "用自然语言搜全库，按段落命中",
  "organize.search.placeholder": "用自然语言搜全库…",
  "organize.search.run": "搜索",
  "organize.search.none": "无命中",
  "organize.tags": "标签建议",
  "organize.tags.hint": "优先复用库内已有标签；白名单文件夹内自动应用",
  "organize.tags.run": "建议标签",
  "organize.tags.apply": "点击应用",
  "organize.tags.applied": "已写入 frontmatter",
  "organize.tags.none": "没有可建议的标签",
  "organize.dup": "近似重复",
  "organize.dup.hint": "代表向量余弦超过阈值的笔记对",
  "organize.dup.run": "检测重复",
  "organize.dup.none": "未发现近似重复",
  "organize.dup.openBoth": "打开两篇",
  "organize.currentNote": "当前笔记",
  "organize.noNote": "（未打开笔记）",
  "organize.busy": "处理中…",

  "integrate.compare": "多篇对比",
  "integrate.compare.hint": "选 2–10 篇同主题笔记，输出共识/分歧/互补",
  "integrate.compare.run": "开始对比",
  "integrate.compare.needTwo": "至少选两篇",
  "integrate.compare.consensus": "共识",
  "integrate.compare.divergence": "分歧",
  "integrate.compare.complementary": "互补",
  "integrate.compare.save": "存为新笔记",
  "integrate.merge": "主题合并",
  "integrate.merge.hint": "选多篇合成一篇结构化草稿，观点带来源标注",
  "integrate.merge.run": "生成合并草稿",
  "integrate.merge.topic": "主题（可选）",
  "integrate.merge.create": "创建笔记",
  "integrate.gaps": "知识缺口",
  "integrate.gaps.hint": "给一个问句，反问你库里缺什么、下一步查什么",
  "integrate.gaps.run": "分析缺口",
  "integrate.gaps.placeholder": "例如：怎么训练注意力？",
  "integrate.gaps.gaps": "缺口",
  "integrate.gaps.nextSteps": "下一步",
  "integrate.picker.title": "选择笔记（可多选）",
  "integrate.created": "已创建笔记",
  "integrate.empty": "模型没有给出有效内容",

  "sessions.label": "会话",
  "sessions.new": "新建会话",
  "sessions.rename": "重命名",
  "sessions.delete": "删除",
  "sessions.empty": "新会话",
  "sessions.deleted": "会话已删除",
  "sessions.renamed": "已重命名",
  "sessions.count": "{n} 条消息",
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
  "settings.contextBudget": "RAG context budget",
  "settings.contextBudget.desc": "Max tokens for retrieved excerpts (1000–60000); lower-scored ones are dropped",
  "settings.saveNotice": "Settings saved",
  "settings.autoOpen": "Open sidebar on load (debug)",

  "err.noApiKey": "Set your API key in settings first",
  "err.emptyQuestion": "Type a question first",

  "rag.indexing": "Building index {done}/{total}…",
  "rag.indexReady": "Index ready: {files} notes · {chunks} chunks",
  "rag.indexEmpty": "Index is empty: set your API key in settings and check excluded folders.",
  "rag.rebuilding": "Rebuilding index…",
  "rag.noHits": "Nothing relevant enough in the vault; this answer cites no notes.",
  "rag.openSource": "Open source",
  "rag.context.prefix": "The following note excerpts are relevant (cite them as [n]; say so if none fit):",
  "rag.firstRunHint": "Lingxi is ready. Build the index once before vault-wide chat: Command palette → Rebuild Lingxi index.",
  "cmd.reindex": "Rebuild Lingxi index",

  "organize.related": "Related notes",
  "organize.related.hint": "Semantic matches for the current note (index required)",
  "organize.related.run": "Find related",
  "organize.related.none": "No related notes above threshold",
  "organize.related.insert": "Insert link",
  "organize.search": "Semantic search",
  "organize.search.hint": "Search the vault in natural language, chunk-level hits",
  "organize.search.placeholder": "Search the vault in natural language…",
  "organize.search.run": "Search",
  "organize.search.none": "No hits",
  "organize.tags": "Tag suggestions",
  "organize.tags.hint": "Prefers existing vault tags; auto-applies inside whitelisted folders",
  "organize.tags.run": "Suggest tags",
  "organize.tags.apply": "Click to apply",
  "organize.tags.applied": "Written to frontmatter",
  "organize.tags.none": "No tag suggestions",
  "organize.dup": "Near-duplicates",
  "organize.dup.hint": "Note pairs whose representative vectors exceed the threshold",
  "organize.dup.run": "Detect duplicates",
  "organize.dup.none": "No near-duplicates found",
  "organize.dup.openBoth": "Open both",
  "organize.currentNote": "Current note",
  "organize.noNote": "(no note open)",
  "organize.busy": "Working…",

  "integrate.compare": "Compare notes",
  "integrate.compare.hint": "Pick 2–10 notes on one topic; outputs consensus / divergence / complementary",
  "integrate.compare.run": "Compare",
  "integrate.compare.needTwo": "Pick at least two notes",
  "integrate.compare.consensus": "Consensus",
  "integrate.compare.divergence": "Divergence",
  "integrate.compare.complementary": "Complementary",
  "integrate.compare.save": "Save as note",
  "integrate.merge": "Merge into draft",
  "integrate.merge.hint": "Merge notes into one structured draft with per-point sources",
  "integrate.merge.run": "Generate draft",
  "integrate.merge.topic": "Topic (optional)",
  "integrate.merge.create": "Create note",
  "integrate.gaps": "Knowledge gaps",
  "integrate.gaps.hint": "Ask a question; get what your vault is missing and what to research next",
  "integrate.gaps.run": "Find gaps",
  "integrate.gaps.placeholder": "e.g. how do I train attention?",
  "integrate.gaps.gaps": "Gaps",
  "integrate.gaps.nextSteps": "Next steps",
  "integrate.picker.title": "Select notes (multi-select)",
  "integrate.created": "Note created",
  "integrate.empty": "The model returned nothing usable",

  "sessions.label": "Sessions",
  "sessions.new": "New session",
  "sessions.rename": "Rename",
  "sessions.delete": "Delete",
  "sessions.empty": "New session",
  "sessions.deleted": "Session deleted",
  "sessions.renamed": "Renamed",
  "sessions.count": "{n} messages",
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
