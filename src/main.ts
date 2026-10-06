/**
 * 灵犀 Lingxi — 插件入口
 */

import { Plugin, Notice, TAbstractFile } from "obsidian";
import { I18n, resolveLang } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";
import type { LingxiSettings } from "./settings";
import type { Transport } from "./core/llm";
import type { IndexerConfig, IndexStats } from "./core/vaultIndexer";
import { VaultIndexer } from "./core/vaultIndexer";
import { requestUrlTransport, fetchModelIds } from "./obsidian/gateway";
import { ObsidianVaultPort } from "./obsidian/obsidianVault";
import { ChatView, CHAT_VIEW_TYPE } from "./obsidian/chatView";
import { LingxiSettingTab } from "./obsidian/settingTab";

const SYNC_DEBOUNCE_MS = 3000;

export default class LingxiPlugin extends Plugin {
  settings: LingxiSettings = { ...DEFAULT_SETTINGS };
  i18n: I18n = new I18n("zh");
  transport: Transport = requestUrlTransport;
  indexer: VaultIndexer | null = null;

  /** 索引器配置由本对象持有并随设置/语言更新（VaultIndexer 按引用读） */
  private indexerConfig: IndexerConfig | null = null;
  private syncTimer: number | null = null;
  private indexing = false;
  /** 最近一次索引进度（供 UI 展示） */
  indexStatus = "";

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.i18n = new I18n(resolveLang(this.settings.language, this.getObsidianLocale()));

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addSettingTab(new LingxiSettingTab(this.app, this));

    this.addRibbonIcon("message-star", this.t("ribbon.tooltip"), () => {
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
      id: "reindex",
      name: this.t("cmd.reindex"),
      callback: () => {
        void this.rebuildIndex("manual");
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

    this.setupIndexer();
    await this.indexer?.loadCache();

    // 文件变动 → 防抖 3 秒增量同步（打字过程中不触发）
    const onVaultChange = (_file: TAbstractFile) => {
      this.scheduleSync();
    };
    this.registerEvent(this.app.vault.on("modify", onVaultChange));
    this.registerEvent(this.app.vault.on("create", onVaultChange));
    this.registerEvent(this.app.vault.on("delete", onVaultChange));
    this.registerEvent(this.app.vault.on("rename", onVaultChange));

    // 首次使用提示：没缓存就告诉哲去建索引（不自动烧额度）
    if (!this.indexer || this.indexer.stats().files === 0) {
      new Notice(this.t("rag.firstRunHint"), 8000);
    }

    // 调试开关：启动即开侧边栏（真机冒烟测试用）
    if (this.settings.autoOpenSidebar) {
      void this.activateView();
    }
  }

  private setupIndexer(): void {
    this.indexerConfig = {
      baseUrl: this.settings.baseUrl,
      apiKey: this.settings.apiKey,
      embeddingModel: this.settings.embeddingModel,
      excludeFolders: this.settings.excludeFolders,
      topK: this.settings.topK,
      similarityThreshold: this.settings.similarityThreshold,
      contextBudgetTokens: this.settings.contextBudgetTokens,
      contextPrefix: this.t("rag.context.prefix"),
    };
    this.indexer = new VaultIndexer(new ObsidianVaultPort(this.app), this.indexerConfig, this.transport);
  }

  /** 设置变更后把索引器配置同步过去（增删模型/排除项即时生效） */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.indexerConfig) {
      this.indexerConfig.baseUrl = this.settings.baseUrl;
      this.indexerConfig.apiKey = this.settings.apiKey;
      this.indexerConfig.embeddingModel = this.settings.embeddingModel;
      this.indexerConfig.excludeFolders = this.settings.excludeFolders;
      this.indexerConfig.topK = this.settings.topK;
      this.indexerConfig.similarityThreshold = this.settings.similarityThreshold;
      this.indexerConfig.contextBudgetTokens = this.settings.contextBudgetTokens;
    }
  }

  /** 建/重建全库索引。并发保护 + 错误 Notice，不 throw 到 UI 层 */
  async rebuildIndex(reason: "initial" | "manual" | "event"): Promise<IndexStats | null> {
    if (!this.indexer || this.indexing) return null;
    this.indexing = true;
    try {
      const stats = await this.indexer.syncAll((phase, done, total) => {
        this.indexStatus =
          phase === "embed"
            ? this.t("rag.indexing", { done, total })
            : this.t("rag.rebuilding");
      });
      this.indexStatus = this.t("rag.indexReady", {
        files: stats.files,
        chunks: stats.chunks,
      });
      if (reason === "manual") {
        new Notice(this.indexStatus);
      } else if (stats.embeddedNow > 0) {
        console.info(`[lingxi] index updated: ${this.indexStatus}`);
      }
      return stats;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.indexStatus = `${this.t("chat.failed")}: ${msg}`;
      new Notice(this.indexStatus);
      return null;
    } finally {
      this.indexing = false;
    }
  }

  private scheduleSync(): void {
    if (this.syncTimer !== null) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      void this.rebuildIndex("event");
    }, SYNC_DEBOUNCE_MS);
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

  /** 界面语言切换（zh <-> en），同步 settings 与索引器文案 */
  async toggleLanguage(): Promise<void> {
    const next = this.i18n.current === "zh" ? "en" : "zh";
    this.i18n.setLang(next);
    this.settings.language = next;
    if (this.indexerConfig) {
      this.indexerConfig.contextPrefix = this.t("rag.context.prefix");
    }
    await this.saveSettings();
  }

  /** 设置页「测试连接」：GET /models */
  async testConnection(): Promise<string[]> {
    const ids = await fetchModelIds({ baseUrl: this.settings.baseUrl, apiKey: this.settings.apiKey });
    if (ids.length === 0) throw new Error("no models returned");
    return ids;
  }

  t(key: string, vars?: Record<string, string | number>): string {
    return this.i18n.t(key, vars);
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
