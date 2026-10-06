/**
 * 希XI — 聊天会话管理（纯 TS）
 *
 * 解决的真问题：以前消息只在内存里，关掉侧边栏/重启 Obsidian 就全丢，
 * 也无法在多个话题间切换。会话落盘到插件目录，启动即恢复。
 *
 * 设计：持久化经回调注入（核心不碰 Obsidian）；activeId 指向当前会话；
 * 标题默认取首条用户消息（截断），可重命名；删除当前会话后自动切到最近一个。
 */

import type { ChatMessage } from "./llm";
import type { Citation } from "./rag";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** 该会话的上下文范围（每个会话独立记住） */
  contextMode: "note" | "selection" | "vault";
  messages: StoredMessage[];
}

/** 落盘消息 = 对话消息 + 可选的引用角标（重开后照样显示） */
export interface StoredMessage extends ChatMessage {
  citations?: Citation[];
}

export interface SessionStoreData {
  version: number;
  activeId: string | null;
  sessions: ChatSession[];
}

export type PersistFn = (data: SessionStoreData) => Promise<void>;
export type LoadFn = () => Promise<string | null>;
export type IdFn = () => string;

const STORE_VERSION = 1;
const TITLE_MAX = 24;

export class SessionStore {
  private sessions = new Map<string, ChatSession>();
  private activeId: string | null = null;

  constructor(
    private persist: PersistFn,
    private load: LoadFn,
    private makeId: IdFn = defaultId,
  ) {}

  /** 从落盘字符串恢复；损坏/版本不符时静默开新会话 */
  async restore(): Promise<void> {
    const raw = await this.load();
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as SessionStoreData;
      if (data.version !== STORE_VERSION || !Array.isArray(data.sessions)) return;
      for (const s of data.sessions) {
        if (s && typeof s.id === "string" && Array.isArray(s.messages)) {
          this.sessions.set(s.id, {
            id: s.id,
            title: typeof s.title === "string" ? s.title : "",
            createdAt: Number(s.createdAt) || Date.now(),
            updatedAt: Number(s.updatedAt) || Date.now(),
            contextMode: s.contextMode === "vault" || s.contextMode === "selection" ? s.contextMode : "note",
            messages: s.messages.filter(
              (m): m is ChatMessage =>
                m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string",
            ),
          });
        }
      }
      this.activeId = this.sessions.has(data.activeId ?? "") ? (data.activeId ?? null) : null;
    } catch {
      // 损坏文件不阻塞启动
    }
  }
  get active(): ChatSession | null {
    return this.activeId ? (this.sessions.get(this.activeId) ?? null) : null;
  }

  /** 按更新时间倒序的会话列表 */
  list(): ChatSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  create(contextMode: ChatSession["contextMode"] = "note"): ChatSession {
    const now = Date.now();
    const session: ChatSession = {
      id: this.makeId(),
      title: "",
      createdAt: now,
      updatedAt: now,
      contextMode,
      messages: [],
    };
    this.sessions.set(session.id, session);
    this.activeId = session.id;
    void this.save();
    return session;
  }

  /** 打开侧边栏时若无会话，建一个空的 */
  ensureActive(contextMode: ChatSession["contextMode"] = "note"): ChatSession {
    return this.active ?? this.create(contextMode);
  }

  switchTo(id: string): boolean {
    if (!this.sessions.has(id)) return false;
    this.activeId = id;
    void this.save();
    return true;
  }

  /** 重命名。空标题视为无改动，返回 false（调用方自行决定是否提示） */
  rename(id: string, title: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    const t = title.trim();
    if (t === "") return false;
    s.title = t.slice(0, TITLE_MAX);
    s.updatedAt = Date.now();
    void this.save();
    return true;
  }

  remove(id: string): boolean {
    if (!this.sessions.delete(id)) return false;
    if (this.activeId === id) {
      this.activeId = this.list()[0]?.id ?? null;
    }
    void this.save();
    return true;
  }

  /** 追加一条消息；首条用户消息自动生成标题 */
  append(sessionId: string, message: StoredMessage): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.messages.push(message);
    s.updatedAt = Date.now();
    if (s.title === "" && message.role === "user") {
      s.title = message.content.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    }
    void this.save();
    return true;
  }

  setContextMode(id: string, mode: ChatSession["contextMode"]): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.contextMode = mode;
    s.updatedAt = Date.now();
    void this.save();
    return true;
  }

  clearMessages(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.messages = [];
    s.title = "";
    s.updatedAt = Date.now();
    void this.save();
    return true;
  }

  private async save(): Promise<void> {
    const data: SessionStoreData = {
      version: STORE_VERSION,
      activeId: this.activeId,
      sessions: this.list(),
    };
    await this.persist(data);
  }
}

function defaultId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 列表展示用：标题或占位 + 时间 */
export function sessionLabel(session: ChatSession, emptyText: string): string {
  const time = new Date(session.updatedAt);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  return `${session.title === "" ? emptyText : session.title} · ${hh}:${mm}`;
}
