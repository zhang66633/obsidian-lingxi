/**
 * 灵犀 Lingxi — 相关笔记与近似重复检测（纯 TS）
 *
 * 代表向量策略：一篇笔记 = 它所有 chunk 向量的均值。
 * 为什么用均值而不是 max：相关笔记列表要比「主题重合度」，
 * 均值对一篇里跑题一段不敏感；重复检测要「整体像」，均值也合适。
 * max 策略留给 QA 检索（那里要的是「最相关的一段」）。
 */

import type { Chunk } from "./index";
import type { VectorStore } from "./vectorStore";
import { cosineSimilarity } from "./vectorStore";

export interface NoteVector {
  path: string;
  /** 该笔记全部 chunk 向量的均值 */
  vector: number[];
  chunkCount: number;
}

/** 从索引+向量缓存构造每篇笔记的代表向量；无向量的 chunk 跳过 */
export function buildNoteVectors(chunks: Chunk[], store: VectorStore): NoteVector[] {
  const byPath = new Map<string, number[][]>();
  for (const c of chunks) {
    const v = store.get(c.id);
    if (!v) continue;
    const list = byPath.get(c.path);
    if (list) list.push(v);
    else byPath.set(c.path, [v]);
  }
  const out: NoteVector[] = [];
  for (const [path, vectors] of byPath) {
    const dim = vectors[0]?.length ?? 0;
    if (dim === 0) continue;
    const mean = new Array<number>(dim).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) mean[i] = (mean[i] ?? 0) + (v[i] ?? 0);
    }
    for (let i = 0; i < dim; i++) mean[i] = (mean[i] ?? 0) / vectors.length;
    out.push({ path, vector: mean, chunkCount: vectors.length });
  }
  return out;
}

export interface RelatedNote {
  path: string;
  score: number;
}

/** 查询向量 → 相关笔记（按代表向量相似度，排除自身，阈值过滤） */
export function relatedNotes(
  queryVector: number[],
  notes: NoteVector[],
  opts: { topN?: number; threshold?: number; excludePath?: string },
): RelatedNote[] {
  const { topN = 10, threshold = 0, excludePath } = opts;
  const out: RelatedNote[] = [];
  for (const n of notes) {
    if (excludePath && n.path === excludePath) continue;
    const score = cosineSimilarity(queryVector, n.vector);
    if (score < threshold) continue;
    out.push({ path: n.path, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}

export interface DuplicatePair {
  a: string;
  b: string;
  score: number;
}

/** 近似重复：代表向量余弦 ≥ threshold 的笔记对（每对只出一次，a<b 字典序） */
export function findDuplicatePairs(notes: NoteVector[], threshold: number): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i];
      const b = notes[j];
      if (!a || !b) continue;
      const score = cosineSimilarity(a.vector, b.vector);
      if (score >= threshold) {
        const [lo, hi] = a.path <= b.path ? [a.path, b.path] : [b.path, a.path];
        pairs.push({ a: lo ?? a.path, b: hi ?? b.path, score });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return pairs;
}
