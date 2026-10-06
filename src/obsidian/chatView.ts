/**
 * 灵犀 Lingxi — 侧边栏视图（ItemView）
 * Phase 1：对话外壳 + 语言切换 + 上下文范围（当前笔记 / 选中内容）。
 * 全库检索（RAG）与引用角标在 Phase 2 接入；整理 / 整合 Tab 为占位。
 */

import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from "obsidian";
import type LingxiPlugin from "../main";
import { chatCompletion } from "../core/llm";
import type { ChatMessage } from "../core/llm";

export const CHAT_VIEW_TYPE = "lingxi-chat-view";

type Tab = "chat" | "organize" | "integrate";
type ContextMode = "note" | "selection";

export class ChatView extends ItemView {
  private plugin: LingxiPlugin;
  private history: ChatMessage[] = [];
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
      const setting = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
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
    const optVault = sel.createEl("option", {
      text: `${this.plugin.t("context.vault")}（Phase 2）`,
      value: "vault",
    });
    optVault.disabled = true;
    sel.value = this.contextMode;
    sel.addEventListener("change", () => {
      const v = sel.value;
      this.contextMode = v === "selection" ? "selection" : "note";
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
    if (this.activeTab !== "chat") {
      const soon = this.bodyEl.createEl("div", { cls: "lingxi-soon" });
      soon.setText(
        this.activeTab === "organize"
          ? this.plugin.t("tab.organize.soon")
          : this.plugin.t("tab.integrate.soon"),
      );
      this.messagesEl = null;
      return;
    }
    this.messagesEl = this.bodyEl.createEl("div", { cls: "lingxi-messages" });
    for (const m of this.history) {
      this.appendMessageEl(m.role, m.content);
    }
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private appendMessageEl(role: ChatMessage["role"], content: string): void {
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
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /** 取当前上下文块：选中文字或当前笔记全文（截断到 2 万字符保护预算） */
  private async buildContextBlock(): Promise<string> {
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

  private setBusy(busy: boolean): void {
    this.busy = busy;
    if (this.sendBtn) this.sendBtn.disabled = busy;
    if (this.inputEl) this.inputEl.disabled = busy;
    if (this.statusEl) this.statusEl.setText(busy ? this.plugin.t("chat.thinking") : "");
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

    this.history.push({ role: "user", content: question });
    this.appendMessageEl("user", question);
    if (this.inputEl) this.inputEl.value = "";
    this.setBusy(true);
    try {
      const contextBlock = await this.buildContextBlock();
      const prior = this.history.slice(-9, -1); // 最近 8 条历史（不含本轮问题）
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
      this.appendMessageEl("assistant", answer);
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
