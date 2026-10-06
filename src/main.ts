/**
 * 灵犀 Lingxi — 插件入口
 */

import { Plugin, Notice } from "obsidian";import { I18n, resolveLang } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";
import type { LingxiSettings } from "./settings";
import type { Transport } from "./core/llm";
import { requestUrlTransport, fetchModelIds } from "./obsidian/gateway";
import { ChatView, CHAT_VIEW_TYPE } from "./obsidian/chatView";
import { LingxiSettingTab } from "./obsidian/settingTab";

export default class LingxiPlugin extends Plugin {
  settings: LingxiSettings = { ...DEFAULT_SETTINGS };
  i18n: I18n = new I18n("zh");
  transport: Transport = requestUrlTransport;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.i18n = new I18n(resolveLang(this.settings.language, this.getObsidianLocale()));

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addSettingTab(new LingxiSettingTab(this.app, this));

    this.addRibbonIcon("message-square", this.t("ribbon.tooltip"), () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-sidebar",
      name: this.t("cmd.openSidebar"),
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "ask-selection",
      name: this.t("cmd.askSelection"),
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection.trim() === "") {
          new Notice(this.t("err.emptyQuestion"));
          return;
        }
        void this.activateView();
        // Phase 1：先打开侧边栏并把问题带过去（问答路由在 Phase 2 完善）
        new Notice(selection.slice(0, 80));
      },
    });

    this.addCommand({
      id: "understand-note",
      name: this.t("cmd.summarizeNote"),
      editorCallback: () => {
        void this.activateView();
      },
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 界面语言切换（zh <-> en），并同步 settings.language */
  async toggleLanguage(): Promise<void> {
    const next = this.i18n.current === "zh" ? "en" : "zh";
    this.i18n.setLang(next);
    this.settings.language = next;
    await this.saveSettings();
  }

  /** 设置页「测试连接」：GET /models */
  async testConnection(): Promise<string[]> {
    const ids = await fetchModelIds({ baseUrl: this.settings.baseUrl, apiKey: this.settings.apiKey });
    if (ids.length === 0) throw new Error("no models returned");
    return ids;
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  /** 系统提示（随语言切换） */
  systemPrompt(): string {
    return this.i18n.current === "zh"
      ? "你是灵犀，一个住在 Obsidian 里的双语笔记助手。回答基于用户提供的笔记内容，" +
        "不确定就明说，不要编造引用；用简洁的中文回答。"
      : "You are Lingxi, a bilingual note assistant living inside Obsidian. " +
        "Answer from the provided note content, say when unsure, never invent citations; reply concisely.";
  }

  private getObsidianLocale(): string | undefined {
    const locale =
      (this.app as unknown as { vault?: { getConfig?: (k: string) => unknown } }).vault?.getConfig?.("language") ??
      (typeof navigator !== "undefined" ? navigator.language : undefined);
    return typeof locale === "string" ? locale : undefined;
  }
}
