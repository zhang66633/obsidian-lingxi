/**
 * 灵犀 Lingxi — 向量缓存（纯 TS）
 *
 * 为什么本地存 base64(Float32)：qwen3-embedding-8b 维度未知（等首次调用确认），
 * Float32 细节无损；base64 比 JSON 数字数组小 4 倍以上，写盘/读盘都快。
 * 模型一换（settings.embeddingModel 变化），全部缓存作废——由 model 字段判定。
 */

export interface VectorStoreData {
  model: string;
  dim: number;
  /** chunkId -> base64(Float32) */
  vectors: Record<string, string>;
}

/** number[] → base64(Float32Array bytes) */
export function toBase64F32(vector: number[]): string {
  const f32 = new Float32Array(vector);
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64(Float32Array bytes) → number[] */
export function fromBase64F32(b64: string): number[] {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const f32 = new Float32Array(bytes.buffer);
  return Array.from(f32);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class VectorStore {
  private vectors = new Map<string, number[]>();
  private model: string | null = null;
  private dim = 0;

  /** 模型变了要整体作废（不同模型的向量空间不可比） */
  ensureModel(model: string, dim: number): boolean {
    if (this.model === model && this.dim === dim) return false;
    this.vectors.clear();
    this.model = model;
    this.dim = dim;
    return true;
  }

  upsert(id: string, vector: number[]): void {
    this.vectors.set(id, vector);
    if (this.dim === 0) this.dim = vector.length;
  }

  remove(id: string): void {
    this.vectors.delete(id);
  }

  has(id: string): boolean {
    return this.vectors.has(id);
  }

  get(id: string): number[] | undefined {
    return this.vectors.get(id);
  }

  get size(): number {
    return this.vectors.size;
  }

  /** 只保留 keepIds 里的向量，返回删除数量（文件被改/删后调用） */
  pruneTo(keepIds: Set<string>): number {
    let removed = 0;
    for (const id of [...this.vectors.keys()]) {
      if (!keepIds.has(id)) {
        this.vectors.delete(id);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.vectors.clear();
  }

  entries(): Array<[string, number[]]> {
    return [...this.vectors.entries()];
  }

  toJSON(): VectorStoreData {
    const out: Record<string, string> = {};
    for (const [id, v] of this.vectors) out[id] = toBase64F32(v);
    return { model: this.model ?? "", dim: this.dim, vectors: out };
  }

  static fromJSON(data: VectorStoreData | null | undefined): VectorStore {
    const store = new VectorStore();
    if (!data || typeof data !== "object") return store;
    store.model = typeof data.model === "string" ? data.model : null;
    store.dim = typeof data.dim === "number" ? data.dim : 0;
    if (data.vectors) {
      for (const [id, b64] of Object.entries(data.vectors)) {
        try {
          store.vectors.set(id, fromBase64F32(b64));
        } catch {
          // 单条损坏不拖垮整个缓存
        }
      }
    }
    return store;
  }
}
