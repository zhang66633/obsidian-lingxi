/**
 * 希XI — 侧边栏视图（ItemView）
 * Phase 5：会话管理（多会话/切换/重命名/删除/重启恢复）接入。
 */

import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from "obsidian";
import type LingxiPlugin from "../main";
import { chatCompletion } from "../core/llm";
import type { ChatMessage } from "../core/llm";
import type { Citation } from "../core/rag";
import { sessionLabel } from "../core/sessions";
import { OrganizePanel } from "./organizePanel";
import { IntegratePanel } from "./integratePanel";
import { RenameModal } from "./renameModal";

export const CHAT_VIEW_TYPE = "xi-chat-view";

type Tab = "chat" | "organize" | "integrate";
type ContextMode = "note" | "selection" | "vault";

export class ChatView extends ItemView {
  private plugin: LingxiPlugin;
  private busy = false;
  private activeTab: Tab = "chat";
  private contextMode: ContextMode = "note";

  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private sessionBarEl: HTMLElement | null = null;
  private sessionSelect: HTMLSelectElement | null = null;
  private tabsBtn: Record<Tab, HTMLElement> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LingxiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.t("view.title");
  }

  getIcon(): string {
    return "message-square";
  }

  /* ---------- 会话便捷访问 ---------- */

  private activeSession() {
    return this.plugin.sessions.ensureActive(this.contextMode);
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("lingxi-root");

    /* ---- header ---- */
    const header = root.createDiv( { cls: "lingxi-header" });
    header.createSpan( { cls: "lingxi-title", text: this.plugin.t("view.title") });

    const langBtn = header.createEl("button", { cls: "lingxi-icon-btn" });
    langBtn.setText(this.plugin.t("view.switchLang"));
    langBtn.addEventListener("click", () => {
      void this.plugin.toggleLanguage().then(() => this.render());
    });

    const gear = header.createEl("button", { cls: "lingxi-icon-btn" });
    gear.setText("⚙");
    gear.setAttribute("aria-label", this.plugin.t("view.openSettings"));
    gear.addEventListener("click", () => {
      const setting = (
        this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }
      ).setting;
      setting.open();
      setting.openTabById("xi-qwen");
    });

    /* ---- 会话栏 ---- */
    this.sessionBarEl = root.createDiv( { cls: "lingxi-session-bar" });
    this.renderSessionBar();

    /* ---- tabs ---- */
    const tabs = root.createDiv( { cls: "lingxi-tabs" });
    const tabChat = tabs.createEl("button", { cls: "lingxi-tab", text: this.plugin.t("tab.chat") });
    const tabOrg = tabs.createEl("button", { cls: "lingxi-tab", text: this.plugin.t("tab.organize") });
    const tabInt = tabs.createEl("button", { cls: "lingxi-tab", text: this.plugin.t("tab.integrate") });
    this.tabsBtn = { chat: tabChat, organize: tabOrg, integrate: tabInt };
    for (const [key, el] of Object.entries(this.tabsBtn) as Array<[Tab, HTMLElement]>) {
      el.addEventListener("click", () => {
        this.activeTab = key;
        this.syncTabs();
        this.renderBody();
      });
    }
    this.syncTabs();

    /* ---- body / footer ---- */
    this.bodyEl = root.createDiv( { cls: "lingxi-body" });
    this.renderFooter(root);
    this.renderBody();
  }

  private renderSessionBar(): void {
    const bar = this.sessionBarEl;
    if (!bar) return;
    bar.empty();

    const label = bar.createSpan( { cls: "lingxi-session-label", text: this.plugin.t("sessions.label") });
    void label;

    const sel = bar.createEl("select", { cls: "lingxi-session-select" });
    const sessions = this.plugin.sessions.list();
    const activeId = this.plugin.sessions.active?.id ?? null;
    for (const s of sessions) {
      sel.createEl("option", { text: sessionLabel(s, this.plugin.t("sessions.empty")), value: s.id });
    }
    if (activeId) sel.value = activeId;
    sel.addEventListener("change", () => {
      const id = sel.value;
      if (this.plugin.sessions.switchTo(id)) {
        const s = this.plugin.sessions.active;
        if (s) {
          this.contextMode = s.contextMode;
        }
        this.render();
      }
    });
    this.sessionSelect = sel;

    const newBtn = bar.createEl("button", { cls: "lingxi-icon-btn", text: "＋" });
    newBtn.setAttribute("title", this.plugin.t("sessions.new"));
    newBtn.setAttribute("aria-label", this.plugin.t("sessions.new"));
    newBtn.addEventListener("click", () => {
      this.plugin.sessions.create(this.contextMode);
      this.render();
    });

    const renameBtn = bar.createEl("button", { cls: "lingxi-icon-btn", text: "✎" });
    renameBtn.setAttribute("title", this.plugin.t("sessions.rename"));
    renameBtn.setAttribute("aria-label", this.plugin.t("sessions.rename"));
    renameBtn.addEventListener("click", () => {
      const s = this.plugin.sessions.active;
      if (!s) return;
      new RenameModal(this.app, s.title, (title) => {
        if (title !== null) {
          this.plugin.sessions.rename(s.id, title);
          new Notice(this.plugin.t("sessions.renamed"));
          this.renderSessionBar();
        }
      }).open();
    });

    const delBtn = bar.createEl("button", { cls: "lingxi-icon-btn", text: "🗑" });
    delBtn.setAttribute("title", this.plugin.t("sessions.delete"));
    delBtn.setAttribute("aria-label", this.plugin.t("sessions.delete"));
    delBtn.addEventListener("click", () => {
      const s = this.plugin.sessions.active;
      if (!s) return;
      if (this.plugin.sessions.remove(s.id)) {
        new Notice(this.plugin.t("sessions.deleted"));
        this.render();
      }
    });
  }

  private syncTabs(): void {
    if (!this.tabsBtn) return;
    for (const [key, el] of Object.entries(this.tabsBtn) as Array<[Tab, HTMLElement]>) {
      el.toggleClass("is-active", key === this.activeTab);
    }
  }

  private renderFooter(root: HTMLElement): void {
    const footer = root.createDiv( { cls: "lingxi-footer" });
    this.footerEl = footer;

    const row = footer.createDiv( { cls: "lingxi-context-row" });
    row.createSpan( { cls: "lingxi-context-label", text: this.plugin.t("context.label") });
    const sel = row.createEl("select", { cls: "lingxi-context-select" });
    sel.createEl("option", { text: this.plugin.t("context.note"), value: "note" });
    sel.createEl("option", { text: this.plugin.t("context.selection"), value: "selection" });
    sel.createEl("option", { text: this.plugin.t("context.vault"), value: "vault" });
    sel.value = this.contextMode;
    sel.addEventListener("change", () => {
      const v = sel.value;
      const mode: ContextMode = v === "vault" ? "vault" : v === "selection" ? "selection" : "note";
      this.contextMode = mode;
      const s = this.plugin.sessions.active;
      if (s) this.plugin.sessions.setContextMode(s.id, mode);
    });

    const inputRow = footer.createDiv( { cls: "lingxi-input-row" });
    const input = inputRow.createEl("textarea", { cls: "lingxi-input" });
    input.setAttribute("rows", "2");
    input.setAttribute("placeholder", this.plugin.t("chat.placeholder"));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        void this.onSend();
      }
    });
    this.inputEl = input;

    const send = inputRow.createEl("button", { cls: "lingxi-send mod-cta" });
    send.setText(this.plugin.t("chat.send"));
    send.addEventListener("click", () => void this.onSend());
    this.sendBtn = send;

    const status = footer.createDiv( { cls: "lingxi-status" });
    this.statusEl = status;
  }

  /** 整块重建静态文案（语言切换用） */
  private render(): void {
    this.contentEl.empty();
    this.messagesEl = null;
    this.inputEl = null;
    this.sendBtn = null;
    this.statusEl = null;
    this.bodyEl = null;
    this.footerEl = null;
    this.sessionBarEl = null;
    this.tabsBtn = null;
    void this.onOpen();
  }

  private renderBody(): void {
    if (!this.bodyEl || !this.footerEl) return;
    this.bodyEl.empty();
    this.footerEl.toggleClass("is-hidden", this.activeTab !== "chat");
    if (this.activeTab === "organize") {
      new OrganizePanel(this.bodyEl, this.plugin).render();
      this.messagesEl = null;
      return;
    }
    if (this.activeTab === "integrate") {
      new IntegratePanel(this.bodyEl, this.plugin).render();
      this.messagesEl = null;
      return;
    }
    this.messagesEl = this.bodyEl.createDiv( { cls: "lingxi-messages" });
    for (const m of this.activeSession().messages) {
      this.appendMessageEl(m.role, m.content, m.citations);
    }
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private appendMessageEl(role: ChatMessage["role"], content: string, citations?: Citation[]): void {
    if (!this.messagesEl || !this.bodyEl) return;
    const isUser = role === "user";
    const bubble = this.messagesEl.createDiv( {
      cls: `lingxi-msg ${isUser ? "is-user" : "is-assistant"}`,
    });
    bubble.createDiv( {
      cls: "lingxi-msg-who",
      text: isUser ? this.plugin.t("chat.you") : this.plugin.t("chat.lingxi"),
    });
    bubble.createDiv( { cls: "lingxi-msg-text", text: content });

    if (!isUser && citations && citations.length > 0) {
      this.renderCitations(bubble, citations);
    }
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /** 引用卡片：[n] 笔记名 › 标题，点击打开对应笔记 */
  private renderCitations(bubble: HTMLElement, citations: Citation[]): void {
    const indexer = this.plugin.indexer;
    const box = bubble.createDiv( { cls: "lingxi-citations" });
    box.createDiv( { cls: "lingxi-citations-title", text: this.plugin.t("chat.citations") });
    for (const c of citations) {
      const chunk = indexer?.index.getChunk(c.chunkId);
      const chip = box.createEl("button", { cls: "lingxi-cite-chip" });
      const label = chunk
        ? `[${c.index}] ${chunk.path}${chunk.heading ? ` › ${chunk.heading}` : ""}`
        : `[${c.index}]`;
      chip.setText(label);
      chip.setAttribute("title", this.plugin.t("rag.openSource"));
      chip.addEventListener("click", () => {
        if (!chunk) return;
        void this.app.workspace.openLinkText(chunk.path.replace(/\.md$/, ""), "", false);
      });
    }
  }

  private async buildNoteContext(): Promise<string> {
    if (this.contextMode === "selection") {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const sel = view?.editor.getSelection() ?? "";
      if (sel.trim() === "") return "";
      return `\n\n【${this.plugin.t("context.selection")}】\n${sel}`;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) return "";
    const text = await this.app.vault.cachedRead(file);
    return `\n\n【${this.plugin.t("context.note")}: ${file.path}】\n${text.slice(0, 20000)}`;
  }

  private setBusy(busy: boolean, statusText?: string): void {
    this.busy = busy;
    if (this.sendBtn) this.sendBtn.disabled = busy;
    if (this.inputEl) this.inputEl.disabled = busy;
    if (this.statusEl) this.statusEl.setText(statusText ?? (busy ? this.plugin.t("chat.thinking") : ""));
  }

  private async onSend(): Promise<void> {
    if (this.busy) return;
    const question = this.inputEl?.value.trim() ?? "";
    if (question === "") {
      new Notice(this.plugin.t("err.emptyQuestion"));
      return;
    }
    const settings = this.plugin.settings;
    if (settings.apiKey.trim() === "") {
      new Notice(this.plugin.t("err.noApiKey"));
      return;
    }
    const sessions = this.plugin.sessions;
    const session = sessions.ensureActive(this.contextMode);

    sessions.append(session.id, { role: "user", content: question });
    this.appendMessageEl("user", question);
    this.renderSessionBar();
    if (this.inputEl) this.inputEl.value = "";

    let citations: Citation[] = [];
    let contextBlock = "";
    try {
      if (this.contextMode === "vault") {
        const stats = this.plugin.indexer?.stats();
        if (!stats || stats.vectors === 0) {
          this.setBusy(true, this.plugin.t("rag.rebuilding"));
          await this.plugin.rebuildIndex("manual");
        }
        const indexer = this.plugin.indexer;
        if (!indexer || indexer.stats().vectors === 0) {
          new Notice(this.plugin.t("rag.indexEmpty"));
        } else {
          this.setBusy(true, this.plugin.t("chat.thinking"));
          const result = await indexer.retrieve(question);
          citations = result.context.citations;
          if (result.context.prompt !== "") {
            contextBlock = `\n\n${result.context.prompt}`;
          } else {
            new Notice(this.plugin.t("rag.noHits"));
          }
        }
      } else {
        contextBlock = await this.buildNoteContext();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.appendMessageEl("assistant", `${this.plugin.t("chat.failed")}: ${msg}`);
      this.setBusy(false);
      return;
    }

    this.setBusy(true, this.plugin.t("chat.thinking"));
    try {
      const prior = session.messages.slice(-9, -1);
      const messages: ChatMessage[] = [
        { role: "system", content: this.plugin.systemPrompt() },
        ...prior,
        { role: "user", content: `${question}${contextBlock}` },
      ];
      const answer = await chatCompletion(
        this.plugin.transport,
        {
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          chatModel: settings.chatModel,
        },
        messages,
        { temperature: settings.temperature, maxTokens: settings.maxOutputTokens },
      );
      sessions.append(session.id, { role: "assistant", content: answer, citations });
      this.appendMessageEl("assistant", answer, citations);
      this.renderSessionBar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.appendMessageEl("assistant", `${this.plugin.t("chat.failed")}: ${msg}`);
    } finally {
      this.setBusy(false);
    }
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
