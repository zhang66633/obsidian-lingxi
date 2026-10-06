/**
 * 灵犀 Lingxi — 笔记索引引擎（纯 TS，零 Obsidian 依赖）
 *
 * 设计原理（docs 里同步记录）：
 * 1. 按标题层级切块：一个标题区间的自然段为一个 chunk；超长区间再按空行分段。
 *    理由：语义完整性优先，检索命中的是「一块完整上下文」而不是碎句。
 * 2. 增量判定 = mtime 相同 且 内容 hash 相同：mtime 可能骗人（同步工具），
 *    hash 便宜（O(n) 字符串扫描），双条件同时成立才跳过。
 * 3. chunk id 带字符偏移：文件内容一变，该文件全部旧 chunk 作废重切，
 *    不做 chunk 级别的 diff（块级 diff 的复杂度不值那点 embedding 费用）。
 */

export interface FileInput {
  path: string;
  mtime: number;
  content: string;
}

export interface Chunk {
  /** 稳定 id：`路径#字符偏移` */
  id: string;
  path: string;
  /** 所属标题路径，如「第二章 / 注意力」；文首段为 "" */
  heading: string;
  text: string;
}

export interface NoteEntry {
  mtime: number;
  hash: string;
  chunkIds: string[];
}

export interface IndexData {
  notes: Record<string, NoteEntry>;
  chunks: Record<string, Chunk>;
}

export interface SyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: number;
}

/** djb2 变体：32 位无符号十六进制 + 长度后缀，冲突率足够且零依赖 */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return ((h >>> 0).toString(16)).padStart(8, "0") + ":" + text.length.toString(16);
}

export interface SplitOptions {
  /** 单个 chunk 的最大字符数，超出按空行强制分段 */
  maxChars?: number;
}

/** 把一篇 markdown 切成若干 chunk */
export function splitIntoChunks(path: string, content: string, opts: SplitOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const lines = content.split(/\r?\n/);
  const chunks: Chunk[] = [];

  let headingStack: string[] = [];
  let sectionStart = 0; // 当前 section 的起始行
  let charStart = 0; // 当前 section 的起始字符偏移
  let charPos = 0; // 已扫描字符数

  const flush = (endLine: number) => {
    const text = lines.slice(sectionStart, endLine).join("\n").trim();
    if (text === "") return;
    const heading = headingStack.join(" / ");
    // 不在这一步截断：超长 chunk 交给 hardSplit，否则内容会被静默丢弃
    chunks.push({
      id: `${path}#${charStart}`,
      path,
      heading,
      text,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush(i);
      const level = headingMatch[1]?.length ?? 1;
      const title = (headingMatch[2] ?? "").trim();
      headingStack = [...headingStack.slice(0, level - 1), title];
      sectionStart = i;
      charStart = charPos;
    } else if (charPos - charStart > maxChars && line.trim() === "") {
      // 超长无标题区间：在空行处强制切一刀
      flush(i);
      sectionStart = i + 1;
      charStart = charPos + line.length + 1;
    }
    charPos += line.length + 1;
  }
  flush(lines.length);

  // 超长 chunk 的二次保障（单行超长时上面的空行切分失效）
  return chunks.flatMap((c) => (c.text.length <= maxChars ? [c] : hardSplit(c, maxChars)));
}

function hardSplit(chunk: Chunk, maxChars: number): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < chunk.text.length; i += maxChars) {
    out.push({
      ...chunk,
      id: `${chunk.id}@${i}`,
      text: chunk.text.slice(i, i + maxChars),
    });
  }
  return out;
}

export class NoteIndex {
  private notes = new Map<string, NoteEntry>();
  private chunks = new Map<string, Chunk>();

  /** 增量同步：返回新增/更新/删除/未变的文件清单 */
  sync(files: FileInput[]): SyncResult {
    const result: SyncResult = { added: [], updated: [], removed: [], unchanged: 0 };
    const seen = new Set<string>();

    for (const file of files) {
      seen.add(file.path);
      const hash = hashText(file.content);
      const existing = this.notes.get(file.path);
      if (existing && existing.mtime === file.mtime && existing.hash === hash) {
        result.unchanged++;
        continue;
      }
      if (existing) this.removeChunksOf(file.path);
      const newChunks = splitIntoChunks(file.path, file.content);
      const chunkIds: string[] = [];
      for (const c of newChunks) {
        // id 冲突防御（同名文件被 replace 的极端情况）
        let id = c.id;
        let n = 1;
        while (this.chunks.has(id)) id = `${c.id}~${n++}`;
        this.chunks.set(id, { ...c, id });
        chunkIds.push(id);
      }
      this.notes.set(file.path, { mtime: file.mtime, hash, chunkIds });
      (existing ? result.updated : result.added).push(file.path);
    }

    for (const path of [...this.notes.keys()]) {
      if (!seen.has(path)) {
        this.removeChunksOf(path);
        this.notes.delete(path);
        result.removed.push(path);
      }
    }
    return result;
  }

  private removeChunksOf(path: string): void {
    const entry = this.notes.get(path);
    if (!entry) return;
    for (const id of entry.chunkIds) this.chunks.delete(id);
  }

  removePath(path: string): boolean {
    const existed = this.notes.delete(path);
    this.removeChunksOf(path);
    return existed;
  }

  getChunk(id: string): Chunk | undefined {
    return this.chunks.get(id);
  }

  chunksByIds(ids: string[]): Chunk[] {
    const out: Chunk[] = [];
    for (const id of ids) {
      const c = this.chunks.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  allChunks(): Chunk[] {
    return [...this.chunks.values()];
  }

  notePaths(): string[] {
    return [...this.notes.keys()];
  }

  /** 该文件当前的全部 chunk id（供向量缓存清理） */
  chunkIdsOf(path: string): string[] {
    return this.notes.get(path)?.chunkIds ?? [];
  }

  toJSON(): IndexData {
    return {
      notes: Object.fromEntries(this.notes),
      chunks: Object.fromEntries(this.chunks),
    };
  }

  static fromJSON(data: IndexData | null | undefined): NoteIndex {
    const idx = new NoteIndex();
    if (!data || typeof data !== "object") return idx;
    if (data.notes) for (const [k, v] of Object.entries(data.notes)) idx.notes.set(k, v);
    if (data.chunks) for (const [k, v] of Object.entries(data.chunks)) idx.chunks.set(k, v);
    return idx;
  }
}
