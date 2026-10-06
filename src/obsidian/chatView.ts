/**
 * 灵犀 Lingxi — 侧边栏视图（ItemView）
 * Phase 2：三种上下文范围（当前笔记 / 选中内容 / 全库检索），
 * 全库模式下回答带引用角标，点击来源卡片直达笔记。
 * 整理 / 整合 Tab 仍为占位（Phase 3/4）。
 */

import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from "obsidian";
import type LingxiPlugin from "../main";
import { chatCompletion } from "../core/llm";
import type { ChatMessage } from "../core/llm";
import type { Citation } from "../core/rag";
import { OrganizePanel } from "./organizePanel";
import { IntegratePanel } from "./integratePanel";

export const CHAT_VIEW_TYPE = "lingxi-chat-view";

type Tab = "chat" | "organize" | "integrate";
type ContextMode = "note" | "selection" | "vault";

interface RenderedMessage {
  role: ChatMessage["role"];
  content: string;
  citations?: Citation[];
}

export class ChatView extends ItemView {
  private plugin: LingxiPlugin;
  private history: ChatMessage[] = [];
  private rendered: RenderedMessage[] = [];
  private busy = false;
  private activeTab: Tab = "chat";
  private contextMode: ContextMode = "note";

  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
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

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("lingxi-root");

    /* ---- header ---- */
    const header = root.createEl("div", { cls: "lingxi-header" });
    header.createEl("span", { cls: "lingxi-title", text: this.plugin.t("view.title") });

    const langBtn = header.createEl("button", { cls: "lingxi-icon-btn" });
    langBtn.setText(this.plugin.t("view.switchLang"));
    langBtn.addEventListener("click", () => {
      this.plugin.toggleLanguage();
      this.render();
    });

    const gear = header.createEl("button", { cls: "lingxi-icon-btn" });
    gear.setText("⚙");
    gear.setAttribute("aria-label", this.plugin.t("view.openSettings"));
    gear.addEventListener("click", () => {
      const setting = (
        this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }
      ).setting;
      setting.open();
      setting.openTabById("lingxi");
    });

    /* ---- tabs ---- */
    const tabs = root.createEl("div", { cls: "lingxi-tabs" });
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
    this.bodyEl = root.createEl("div", { cls: "lingxi-body" });
    this.renderFooter(root);
    this.renderBody();
  }

  private syncTabs(): void {
    if (!this.tabsBtn) return;
    for (const [key, el] of Object.entries(this.tabsBtn) as Array<[Tab, HTMLElement]>) {
      el.toggleClass("is-active", key === this.activeTab);
    }
  }

  private renderFooter(root: HTMLElement): void {
    const footer = root.createEl("div", { cls: "lingxi-footer" });
    this.footerEl = footer;

    const row = footer.createEl("div", { cls: "lingxi-context-row" });
    row.createEl("span", { cls: "lingxi-context-label", text: this.plugin.t("context.label") });
    const sel = row.createEl("select", { cls: "lingxi-context-select" });
    sel.createEl("option", { text: this.plugin.t("context.note"), value: "note" });
    sel.createEl("option", { text: this.plugin.t("context.selection"), value: "selection" });
    sel.createEl("option", { text: this.plugin.t("context.vault"), value: "vault" });
    sel.value = this.contextMode;
    sel.addEventListener("change", () => {
      const v = sel.value;
      this.contextMode = v === "vault" ? "vault" : v === "selection" ? "selection" : "note";
    });

    const inputRow = footer.createEl("div", { cls: "lingxi-input-row" });
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

    const status = footer.createEl("div", { cls: "lingxi-status" });
    this.statusEl = status;
  }

  /** 整块重建静态文案（语言切换时调用） */
  private render(): void {
    this.contentEl.empty();
    this.messagesEl = null;
    this.inputEl = null;
    this.sendBtn = null;
    this.statusEl = null;
    this.bodyEl = null;
    this.footerEl = null;
    this.tabsBtn = null;
    void this.onOpen();
  }

  private renderBody(): void {
    if (!this.bodyEl || !this.footerEl) return;
    this.bodyEl.empty();
    this.footerEl.toggleClass("is-hidden", this.activeTab !== "chat");
    if (this.activeTab === "organize") {
      new OrganizePanel(this.bodyEl, this.plugin).render();
    } else if (this.activeTab === "integrate") {
      new IntegratePanel(this.bodyEl, this.plugin).render();
    } else {
      this.messagesEl = this.bodyEl.createEl("div", { cls: "lingxi-messages" });
      for (const m of this.rendered) {
        this.appendMessageEl(m.role, m.content, m.citations);
      }
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    }
  }

  private appendMessageEl(role: ChatMessage["role"], content: string, citations?: Citation[]): void {
    if (!this.messagesEl || !this.bodyEl) return;
    const isUser = role === "user";
    const bubble = this.messagesEl.createEl("div", {
      cls: `lingxi-msg ${isUser ? "is-user" : "is-assistant"}`,
    });
    bubble.createEl("div", {
      cls: "lingxi-msg-who",
      text: isUser ? this.plugin.t("chat.you") : this.plugin.t("chat.lingxi"),
    });
    bubble.createEl("div", { cls: "lingxi-msg-text", text: content });

    if (!isUser && citations && citations.length > 0) {
      this.renderCitations(bubble, citations);
    }
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /** 引用卡片：[n] 笔记名 › 标题，点击打开对应笔记 */
  private renderCitations(bubble: HTMLElement, citations: Citation[]): void {
    const indexer = this.plugin.indexer;
    const box = bubble.createEl("div", { cls: "lingxi-citations" });
    box.createEl("div", { cls: "lingxi-citations-title", text: this.plugin.t("chat.citations") });
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

    this.rendered.push({ role: "user", content: question });
    this.history.push({ role: "user", content: question });
    this.appendMessageEl("user", question);
    if (this.inputEl) this.inputEl.value = "";

    let citations: Citation[] = [];
    let contextBlock = "";
    try {
      if (this.contextMode === "vault") {
        // 索引没建好就先建（空库时同步等待，界面上给状态）
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
      const prior = this.history.slice(-9, -1);
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
      this.history.push({ role: "assistant", content: answer });
      this.rendered.push({ role: "assistant", content: answer, citations });
      this.appendMessageEl("assistant", answer, citations);
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
