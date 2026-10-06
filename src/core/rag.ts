/**
 * 希XI — RAG 检索与上下文装配（纯 TS）
 *
 * 引用协议：拼给模型的上下文里每块标注 [1][2]…，模型回答里回引同样的编号，
 * UI 再把编号翻译成可点击的来源卡片。parseCitationIds 只认 1-2 位数字，
 * 避免把 markdown 里的 [注] 之类误当引用。
 */

import type { Chunk } from "./index";
import type { VectorStore } from "./vectorStore";
import { cosineSimilarity } from "./vectorStore";

export interface RetrievalHit {
  id: string;
  score: number;
}

export function retrieveTopK(
  queryVector: number[],
  store: VectorStore,
  opts: { topK: number; threshold?: number },
): RetrievalHit[] {
  const hits: RetrievalHit[] = [];
  for (const [id, vec] of store.entries()) {
    const score = cosineSimilarity(queryVector, vec);
    if (opts.threshold !== undefined && score < opts.threshold) continue;
    hits.push({ id, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(0, opts.topK));
}

/** 粗略 token 估计（偏保守）：中英混排按 2 字符 ≈ 1 token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export interface Citation {
  /** 回答里的引用编号，从 1 开始 */
  index: number;
  chunkId: string;
}

export interface RagContext {
  /** 拼进 user message 的上下文文本 */
  prompt: string;
  citations: Citation[];
}

/**
 * 把检索命中的 chunk 组装成带编号的上下文。
 * budgetTokens 超了就停止追加（至少保留第一条），命中块按分数降序进入。
 * prefix 由调用方按当前语言传入（中英双语）。
 */
export function buildRagContext(
  chunks: Chunk[],
  hits: RetrievalHit[],
  opts: { budgetTokens?: number; prefix?: string } = {},
): RagContext {
  const budget = opts.budgetTokens ?? 12000;
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const lines: string[] = [];
  const citations: Citation[] = [];
  let used = 0;

  for (const hit of hits) {
    const chunk = byId.get(hit.id);
    if (!chunk) continue;
    const index = citations.length + 1;
    const title = chunk.heading === "" ? chunk.path : `${chunk.path} › ${chunk.heading}`;
    const block = `[${index}] 《${title}》\n${chunk.text}`;
    const cost = estimateTokens(block);
    if (citations.length > 0 && used + cost > budget) break;
    lines.push(block);
    citations.push({ index, chunkId: chunk.id });
    used += cost;
  }

  const prefix =
    opts.prefix ?? "以下是与问题相关的笔记片段（回答请用 [编号] 标注引用来源；没有合适片段就直说）：";
  const prompt =
    citations.length === 0
      ? ""
      : `${prefix}\n\n${lines.join("\n\n")}`;
  return { prompt, citations };
}

/** 从模型回答里提取引用编号，去重升序 */
export function parseCitationIds(text: string): number[] {
  const found = new Set<number>();
  const re = /\[(\d{1,2})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n >= 1) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}
