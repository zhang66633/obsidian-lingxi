/**
 * 希XI — 设置页
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LingxiPlugin from "../main";
import { parseFolderList, folderListToText } from "../settings";

/*
 * 说明（对照官方 lint 的 prefer-setting-definitions warning）：
 * 暂不迁移 1.13+ 声明式设置 API——它一旦启用就替代 display() 成为渲染路径，
 * 而无 GUI 回归手段验证 13 个控件的渲染行为；display() 在 <1.13 也要保留。
 * 迁移作为独立 phase 排期（docs/00-开发计划.md 已记），不在此版本冒险。
 */
export class LingxiSettingTab extends PluginSettingTab {
  private plugin: LingxiPlugin;

  constructor(app: App, plugin: LingxiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const t = (key: string) => this.plugin.t(key);
    const s = this.plugin.settings;

    new Setting(containerEl).setName(t("settings.title")).setHeading();

    /* ---- 语言 ---- */
    new Setting(containerEl).setName(t("settings.language")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.language"))
      .addDropdown((dd) =>
        dd
          .addOption("auto", t("settings.language.auto"))
          .addOption("zh", t("settings.language.zh"))
          .addOption("en", t("settings.language.en"))
          .setValue(s.language)
          .onChange(async (v) => {
            s.language = v as typeof s.language;
            await this.plugin.saveSettings();
          }),
      );

    /* ---- 模型接入 ---- */
    new Setting(containerEl).setName(t("settings.connection")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.baseUrl"))
      .setDesc(t("settings.baseUrl.desc"))
      .addText((txt) =>
        txt.setValue(s.baseUrl).onChange(async (v) => {
          s.baseUrl = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.apiKey"))
      .setDesc(t("settings.apiKey.desc"))
      .addText((txt) => {
        txt.setValue(s.apiKey).onChange(async (v) => {
          s.apiKey = v.trim();
          await this.plugin.saveSettings();
        });
        txt.inputEl.type = "password";
      });
    new Setting(containerEl)
      .setName(t("settings.chatModel"))
      .addText((txt) =>
        txt.setValue(s.chatModel).onChange(async (v) => {
          s.chatModel = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.embeddingModel"))
      .addText((txt) =>
        txt.setValue(s.embeddingModel).onChange(async (v) => {
          s.embeddingModel = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.testConnection"))
      .addButton((btn) =>
        btn.setButtonText(t("settings.testConnection")).onClick(async () => {
          try {
            const ids = await this.plugin.testConnection();
            new Notice(t("settings.test.ok").replace("{n}", String(ids.length)));
          } catch (err) {
            new Notice(t("settings.test.fail").replace("{msg}", err instanceof Error ? err.message : String(err)));
          }
        }),
      );

    /* ---- 上下文预算 ---- */
    new Setting(containerEl).setName(t("settings.budget")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.maxInputTokens"))
      .addText((txt) =>
        txt.setValue(String(s.maxInputTokens)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            s.maxInputTokens = Math.floor(n);
            await this.plugin.saveSettings();
          }
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.maxOutputTokens"))
      .addText((txt) =>
        txt.setValue(String(s.maxOutputTokens)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            s.maxOutputTokens = Math.floor(n);
            await this.plugin.saveSettings();
          }
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.topK"))
      .addSlider((sl) =>
        sl
          .setLimits(1, 20, 1)
          .setValue(s.topK)
          .onChange(async (v) => {
            s.topK = v;
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t("settings.temperature"))
      .addSlider((sl) =>
        sl
          .setLimits(0, 1, 0.05)
          .setValue(s.temperature)
          .onChange(async (v) => {
            s.temperature = v;
            await this.plugin.saveSettings();
          }),
      );

    /* ---- 索引与写入范围 ---- */
    new Setting(containerEl).setName(t("settings.scope")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.excludeFolders"))
      .addTextArea((ta) => {
        ta.setValue(folderListToText(s.excludeFolders)).onChange(async (v) => {
          s.excludeFolders = parseFolderList(v);
          await this.plugin.saveSettings();
        });
        ta.inputEl.rows = 4;
        ta.inputEl.cols = 40;
      });
    new Setting(containerEl)
      .setName(t("settings.autoFolders"))
      .setDesc(t("settings.autoFolders.desc"))
      .addTextArea((ta) => {
        ta.setValue(folderListToText(s.autoOrganizeFolders)).onChange(async (v) => {
          s.autoOrganizeFolders = parseFolderList(v);
          await this.plugin.saveSettings();
        });
        ta.inputEl.rows = 4;
        ta.inputEl.cols = 40;
      });
    new Setting(containerEl)
      .setName(t("settings.similarity"))
      .addSlider((sl) =>
        sl
          .setLimits(0.5, 0.99, 0.01)
          .setValue(s.similarityThreshold)
          .onChange(async (v) => {
            s.similarityThreshold = v;
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t("settings.contextBudget"))
      .setDesc(t("settings.contextBudget.desc"))
      .addText((txt) =>
        txt.setValue(String(s.contextBudgetTokens)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 1000 && n <= 60000) {
            s.contextBudgetTokens = Math.floor(n);
            await this.plugin.saveSettings();
          }
        }),
      );
    new Setting(containerEl)
      .setName(t("settings.autoOpen"))
      .addToggle((tg) =>
        tg.setValue(s.autoOpenSidebar).onChange(async (v) => {
          s.autoOpenSidebar = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
