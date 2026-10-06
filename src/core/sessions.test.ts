import { describe, expect, it, vi } from "vitest";
import { SessionStore, sessionLabel } from "./sessions";
import type { ChatMessage } from "./llm";
import type { SessionStoreData } from "./sessions";

function makeStore() {
  const persist = vi.fn(async (_data: SessionStoreData) => {});
  let stored: string | null = null;
  const load = vi.fn(async () => stored);
  const store = new SessionStore(persist, load, (() => {
    let n = 0;
    return () => `id_${++n}`;
  })());
  return { store, persist, load, setStored: (s: string | null) => (stored = s) };
}

const user = (content: string): ChatMessage => ({ role: "user", content });

describe("SessionStore 基础操作", () => {
  it("ensureActive：无会话时建空会话", () => {
    const { store } = makeStore();
    const s = store.ensureActive();
    expect(store.active?.id).toBe(s.id);
    expect(store.list()).toHaveLength(1);
  });

  it("append：首条用户消息自动生成标题，后续追加不变标题", () => {
    const { store } = makeStore();
    const s = store.ensureActive();
    store.append(s.id, user("帮我看看关于注意力的笔记"));
    expect(store.active?.title).toBe("帮我看看关于注意力的笔记");
    store.append(s.id, { role: "assistant", content: "好的" });
    expect(store.active?.title).toBe("帮我看看关于注意力的笔记");
    store.append(s.id, user("第二个问题"));
    expect(store.active?.title).toBe("帮我看看关于注意力的笔记");
  });

  it("标题超长截断、空白折叠", () => {
    const { store } = makeStore();
    const s = store.ensureActive();
    store.append(s.id, user("a".repeat(50) + "\n\n  extra"));
    expect((store.active?.title ?? "").length).toBeLessThanOrEqual(24);
  });

  it("rename：空标题不覆盖，超长截断", () => {
    const { store } = makeStore();
    const s = store.ensureActive();
    store.append(s.id, user("原标题"));
    expect(store.rename(s.id, "")).toBe(false);
    expect(store.rename(s.id, "新名字")).toBe(true);
    expect(store.active?.title).toBe("新名字");
    expect(store.rename(s.id, "x".repeat(50)).valueOf()).toBe(true);
    expect((store.active?.title ?? "").length).toBeLessThanOrEqual(24);
  });

  it("switchTo：切走再切回，消息保留", () => {
    const { store } = makeStore();
    const a = store.ensureActive();
    store.append(a.id, user("A 的话题"));
    const b = store.create();
    store.append(b.id, user("B 的话题"));
    expect(store.switchTo(a.id)).toBe(true);
    expect(store.active?.messages).toHaveLength(1);
    expect(store.active?.messages[0]?.content).toBe("A 的话题");
    expect(store.switchTo("不存在")).toBe(false);
  });

  it("remove：删当前会话自动落到最近更新的一个", () => {
    const { store } = makeStore();
    const a = store.ensureActive();
    store.append(a.id, user("旧"));
    const b = store.create();
    store.append(b.id, user("新"));
    store.remove(b.id);
    expect(store.active?.id).toBe(a.id);
    store.remove(a.id);
    expect(store.active).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("list：按更新时间倒序", async () => {
    const { store } = makeStore();
    const a = store.ensureActive();
    await new Promise((r) => setTimeout(r, 2));
    const b = store.create();
    expect(store.list().map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("persist 每次变更都被调用", async () => {
    const { store, persist } = makeStore();
    const s = store.ensureActive();
    persist.mockClear();
    store.append(s.id, user("hi"));
    await Promise.resolve();
    expect(persist).toHaveBeenCalled();
  });
});

describe("SessionStore 持久化", () => {
  it("restore：恢复会话与 activeId", async () => {
    const { store, setStored } = makeStore();
    setStored(
      JSON.stringify({
        version: 1,
        activeId: "x2",
        sessions: [
          { id: "x1", title: "一", createdAt: 1, updatedAt: 2, contextMode: "note", messages: [user("甲")] },
          { id: "x2", title: "二", createdAt: 1, updatedAt: 3, contextMode: "vault", messages: [user("乙")] },
        ],
      }),
    );
    await store.restore();
    expect(store.list()).toHaveLength(2);
    expect(store.active?.id).toBe("x2");
    expect(store.active?.messages[0]?.content).toBe("乙");
    expect(store.active?.contextMode).toBe("vault");
  });

  it("restore：损坏 JSON 不炸，静默空库", async () => {
    const { store, setStored } = makeStore();
    setStored("{ 这不是 json");
    await expect(store.restore()).resolves.toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("restore：版本不符丢弃", async () => {
    const { store, setStored } = makeStore();
    setStored(JSON.stringify({ version: 99, sessions: [] }));
    await store.restore();
    expect(store.list()).toEqual([]);
  });

  it("restore：activeId 指向已删会话 → null", async () => {
    const { store, setStored } = makeStore();
    setStored(JSON.stringify({ version: 1, activeId: "gone", sessions: [] }));
    await store.restore();
    expect(store.active).toBeNull();
  });

  it("roundtrip：persist 的内容能还原", async () => {
    const { store, persist, setStored } = makeStore();
    const s = store.ensureActive();
    store.append(s.id, user("会话甲"));
    store.rename(s.id, "改名后");
    await new Promise((r) => setTimeout(r, 5));
    const last = persist.mock.calls.at(-1)?.[0];
    setStored(JSON.stringify(last));
    const { store: store2 } = makeStore();
    void store2;
    // 用同一份落盘数据新建 store 恢复
    const persist2 = vi.fn(async () => {});
    const store3 = new SessionStore(persist2, async () => JSON.stringify(last), () => "z");
    await store3.restore();
    expect(store3.active?.title).toBe("改名后");
    expect(store3.active?.messages[0]?.content).toBe("会话甲");
  });
});

describe("sessionLabel", () => {
  it("空标题用占位，带 HH:mm", () => {
    const { store } = makeStore();
    const s = store.ensureActive();
    expect(sessionLabel(s, "新会话")).toMatch(/新会话 · \d{2}:\d{2}/);
    store.rename(s.id, "有标题");
    expect(sessionLabel(s, "新会话")).toContain("有标题");
  });
});
