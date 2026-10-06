/**
 * 希XI — 标签建议的提示词构造与输出解析（纯 TS）
 *
 * 设计：优先复用库内已有标签（保持标签体系收敛），确有必要才允许新标签。
 * 模型输出约定为一个 JSON 数组；解析宽容（围栏/散文里的数组都能捞），
 * 但过滤严格（去 #、去重、限量、可选只允许词表内）。
 */

export interface TagVocabEntry {
  tag: string;
  count: number;
}

/** 从一批笔记文本里统计标签词频（# 后跟中英字母数字-_/） */
export function extractTagVocabulary(contents: string[], limit = 60): TagVocabEntry[] {
  const counts = new Map<string, number>();
  const re = /(?:^|[\s(])#([A-Za-z0-9_\-/\u4e00-\u9fa5]{1,40})/g;
  for (const text of contents) {
    for (const m of text.matchAll(re)) {
      const tag = m[1];
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export function buildTagUserPrompt(noteText: string, vocabulary: string[], maxTags: number, lang: "zh" | "en"): string {
  const vocabBlock =
    vocabulary.length > 0
      ? lang === "zh"
        ? `库内已有标签（优先从中选择）：${vocabulary.join("、")}`
        : `Existing vault tags (prefer these): ${vocabulary.join(", ")}`
      : lang === "zh"
        ? "库内暂无既有标签。"
        : "No existing tags in the vault yet.";
  const instruction =
    lang === "zh"
      ? `请阅读下面的笔记，给出最多 ${maxTags} 个最合适的标签。优先复用已有标签；` +
        "只有当内容明显属于一个反复出现但没有标签的主题时才新建。只输出 JSON 数组字符串，不要任何解释。"
      : `Read the note below and suggest at most ${maxTags} tags. Prefer existing tags; ` +
        "only create new ones for a clearly recurring but untagged theme. Output a JSON array of strings only, no explanation.";
  return `${instruction}\n\n${vocabBlock}\n\n---\n${noteText.slice(0, 12000)}\n---`;
}

export function buildTagSystemPrompt(lang: "zh" | "en"): string {
  return lang === "zh"
    ? "你是标签助手。只输出 JSON 数组，例如 [\"注意力\",\"学习方法\"]。不要编号、不要解释、不要代码围栏。"
    : "You are a tagging assistant. Output only a JSON array, e.g. [\"attention\",\"learning\"]. No numbering, no explanation, no code fences.";
}

/** 从模型输出里解析标签：宽容提取数组（跳过空数组），严格过滤结果 */
export function parseTagSuggestions(text: string, opts: { vocabulary?: string[]; maxTags?: number } = {}): string[] {
  const { maxTags = 8 } = opts;
  // 模型可能先抒情再给答案：把所有 [...] 都试一遍，第一个非空且合法的算数
  const candidates = text.match(/\[[\s\S]*?\]/g) ?? [];
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, "-");
      if (tag === "" || tag.length > 40) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= maxTags) break;
    }
    if (out.length > 0) return out;
  }
  return [];
}
