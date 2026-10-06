/**
 * 灵犀 Lingxi — 库级索引编排（纯 TS，零 Obsidian 依赖）
 *
 * 职责：VaultPort 拿文件 → NoteIndex 增量切块 → 缺向量的 chunk 调 embedding →
 * 失效向量清理 → 缓存落盘；检索时向量化问题后走 RAG。
 *
 * v0.1 已知取舍（写进 docs）：每次 sync 全量读取笔记文本做 hash 判定，
 * 几千篇的库无所谓；向量缓存整包重写，不做事后增量补丁——实现简单且不会错，
 * 库特别大时再优化成「只重写变更文件」。
 */

import type { Chunk } from "./index";
import { NoteIndex } from "./index";
import type { FileInput as FileInputLite, IndexData } from "./index";
import type { VectorStoreData, VectorStore } from "./vectorStore";
import { VectorStore as VectorStoreClass } from "./vectorStore";
import { buildRagContext, retrieveTopK } from "./rag";
import type { RagContext, RetrievalHit } from "./rag";
import { embedTexts } from "./llm";
import type { Transport } from "./llm";

export interface NoteFile {
  path: string;
  mtime: number;
}

export interface VaultPort {
  listMarkdownFiles(): NoteFile[];
  /** 异步读取：1.13.1 typings 起 cachedRead 返回 Promise；await 对旧版同步返回也安全 */
  readNote(path: string): Promise<string>;
  readCache(): Promise<string | null>;
  writeCache(json: string): Promise<void>;
}

export interface IndexerConfig {
  baseUrl: string;
  apiKey: string;
  embeddingModel: string;
  excludeFolders: string[];
  topK: number;
  similarityThreshold: number;
  /** RAG 上下文 token 预算 */
  contextBudgetTokens: number;
  /** 拼上下文的引导句（随界面语言） */
  contextPrefix?: string;
  embedBatchSize?: number;
}

export interface IndexStats {
  files: number;
  chunks: number;
  vectors: number;
  /** 本次新算的向量数（0 = 缓存全命中） */
  embeddedNow: number;
}

export type ProgressFn = (phase: "sync" | "embed", done: number, total: number) => void;

const CACHE_VERSION = 1;
const DEFAULT_EMBED_BATCH = 16;

/** 路径排除判定：文件夹或其子路径 */
export function isExcluded(path: string, folders: string[]): boolean {
  const p = path.replace(/\\/g, "/");
  return folders.some((raw) => {
    const f = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (f === "") return false;
    return p === f || p.startsWith(`${f}/`);
  });
}

interface CacheFile {
  version: number;
  embeddingModel: string;
  index: IndexData;
  vectors: VectorStoreData;
}

export class VaultIndexer {
  index = new NoteIndex();
  store: VectorStore = new VectorStoreClass();

  constructor(
    private port: VaultPort,
    private cfg: IndexerConfig,
    private transport: Transport,
  ) {}

  private async embedInputs(texts: string[]): Promise<number[][]> {
    return embedTexts(
      this.transport,
      { baseUrl: this.cfg.baseUrl, apiKey: this.cfg.apiKey, embeddingModel: this.cfg.embeddingModel },
      texts,
    );
  }

  /** 读缓存；模型变了返回 false 且不清库（由调用方决定是否强制重建） */
  async loadCache(): Promise<boolean> {
    const raw = await this.port.readCache();
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as CacheFile;
      if (data.version !== CACHE_VERSION) return false;
      if (data.embeddingModel !== this.cfg.embeddingModel) return false;
      this.index = NoteIndex.fromJSON(data.index);
      this.store = VectorStoreClass.fromJSON(data.vectors);
      return this.index.notePaths().length > 0;
    } catch {
      return false;
    }
  }

  /** 全量同步 + 增量 embedding。返回统计与本次新算向量数 */
  async syncAll(onProgress?: ProgressFn): Promise<IndexStats> {
    const files = this.port
      .listMarkdownFiles()
      .filter((f) => !isExcluded(f.path, this.cfg.excludeFolders));

    onProgress?.("sync", 0, files.length);
    const inputs: FileInputLite[] = [];
    for (const f of files) {
      inputs.push({ path: f.path, mtime: f.mtime, content: await this.port.readNote(f.path) });
      onProgress?.("sync", inputs.length, files.length);
    }

    // 先记下每个文件同步前的 chunk id：文件只要被改/删，它的旧向量全部作废。
    // 不能只按 id 集合剪枝——新内容可能复用同样的 id（同路径同偏移），
    // 那样旧向量会冒充新内容的命中（静默的错误检索结果）。
    const oldIdsByPath = new Map<string, string[]>();
    for (const f of files) oldIdsByPath.set(f.path, this.index.chunkIdsOf(f.path));

    const sync = this.index.sync(inputs);
    const changed = new Set([...sync.added, ...sync.updated, ...sync.removed]);
    const staleIds = new Set<string>();
    for (const path of changed) {
      for (const id of oldIdsByPath.get(path) ?? []) staleIds.add(id);
    }

    // 失效向量清理：被删/被改文件留下的旧 chunk 向量
    const aliveIds = new Set(
      this.index
        .allChunks()
        .map((c) => c.id)
        .filter((id) => !staleIds.has(id)),
    );
    this.store.pruneTo(aliveIds);

    const missing: Chunk[] = this.index.allChunks().filter((c) => !this.store.has(c.id));
    const batchSize = Math.max(1, this.cfg.embedBatchSize ?? DEFAULT_EMBED_BATCH);
    let embeddedNow = 0;
    for (let i = 0; i < missing.length; i += batchSize) {
      const slice = missing.slice(i, i + batchSize);
      const vectors = await this.embedInputs(slice.map((c) => c.text));
      vectors.forEach((v, j) => {
        const chunk = slice[j];
        if (chunk) this.store.upsert(chunk.id, v);
      });
      embeddedNow += slice.length;
      onProgress?.("embed", Math.min(i + slice.length, missing.length), missing.length);
    }

    await this.persist();
    return {
      files: this.index.notePaths().length,
      chunks: this.index.allChunks().length,
      vectors: this.store.size,
      embeddedNow,
    };
  }

  private async persist(): Promise<void> {
    const data: CacheFile = {
      version: CACHE_VERSION,
      embeddingModel: this.cfg.embeddingModel,
      index: this.index.toJSON(),
      vectors: this.store.toJSON(),
    };
    await this.port.writeCache(JSON.stringify(data));
  }

  /** 检索 + 装配上下文；库为空或全是低分命中时返回空 citations 的结果 */
  async retrieve(question: string): Promise<{ hits: RetrievalHit[]; context: RagContext }> {
    const [queryVector] = await this.embedInputs([question]);
    if (!queryVector) return { hits: [], context: { prompt: "", citations: [] } };
    const hits = retrieveTopK(queryVector, this.store, {
      topK: this.cfg.topK,
      threshold: this.cfg.similarityThreshold,
    });
    const context = buildRagContext(this.index.allChunks(), hits, {
      budgetTokens: this.cfg.contextBudgetTokens,
      prefix: this.cfg.contextPrefix,
    });
    return { hits, context };
  }

  stats(): Omit<IndexStats, "embeddedNow"> {
    return {
      files: this.index.notePaths().length,
      chunks: this.index.allChunks().length,
      vectors: this.store.size,
    };
  }
}
