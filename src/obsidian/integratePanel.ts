/**
 * 灵犀 Lingxi — 整合面板（Obsidian 侧 UI）
 * 三件套：多篇对比（共识/分歧/互补）、主题合并（草稿可建笔记）、知识缺口。
 * 逻辑在 core/insight.ts（已单测），这里只做编排与渲染。
 */

import { Notice, TFile } from "obsidian";
import type LingxiPlugin from "../main";
import { runCompare, runGaps, runMerge } from "../core/insight";
import type { CompareResult } from "../core/insight";
import { MultiFileModal } from "./multiFileModal";

const MAX_PICK = 10;

export class IntegratePanel {
  private plugin: LingxiPlugin;
  private busy = false;

  constructor(
    private container: HTMLElement,
    plugin: LingxiPlugin,
  ) {
    this.plugin = plugin;
  }

  private t(key: string): string {
    return this.plugin.t(key);
  }

  private insightCfg() {
    return {
      baseUrl: this.plugin.settings.baseUrl,
      apiKey: this.plugin.settings.apiKey,
      chatModel: this.plugin.settings.chatModel,
      language: this.plugin.i18n.current,
      maxOutputTokens: this.plugin.settings.maxOutputTokens,
    };
  }

  render(): void {
    const c = this.container;
    c.empty();
    c.addClass("lingxi-integrate");

    this.section("integrate.compare", "integrate.compare.hint", (body) => {
      const btn = body.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("integrate.compare.run") });
      btn.addEventListener("click", () => void this.runCompare(body));
    });

    this.section("integrate.merge", "integrate.merge.hint", (body) => {
      const row = body.createEl("div", { cls: "lingxi-org-row" });
      const topic = row.createEl("input", { cls: "lingxi-org-input", attr: { placeholder: this.t("integrate.merge.topic") } });
      const btn = row.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("integrate.merge.run") });
      btn.addEventListener("click", () => void this.runMerge(body, topic.value.trim() || undefined));
    });

    this.section("integrate.gaps", "integrate.gaps.hint", (body) => {
      const row = body.createEl("div", { cls: "lingxi-org-row" });
      const input = row.createEl("input", { cls: "lingxi-org-input", attr: { placeholder: this.t("integrate.gaps.placeholder") } });
      const btn = row.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("integrate.gaps.run") });
      const go = () => void this.runGaps(body, input.value);
      btn.addEventListener("click", go);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") go();
      });
    });
  }

  private section(titleKey: string, descKey: string, build: (body: HTMLElement) => void): void {
    const box = this.container.createEl("div", { cls: "lingxi-section" });
    box.createEl("div", { cls: "lingxi-section-title", text: this.t(titleKey) });
    box.createEl("div", { cls: "lingxi-section-desc", text: this.t(descKey) });
    build(box);
  }

  private setBusy(body: HTMLElement, busy: boolean, text?: string): void {
    this.busy = busy;
    for (const btn of Array.from(body.querySelectorAll<HTMLButtonElement>("button"))) btn.disabled = busy;
    for (const el of Array.from(body.querySelectorAll(".lingxi-section-status"))) el.remove();
    if (busy && text) body.createEl("div", { cls: "lingxi-section-status", text });
  }

  private clearResults(body: HTMLElement): void {
    for (const el of Array.from(body.querySelectorAll(".lingxi-results"))) el.remove();
  }

  /** 弹多选窗 → 取选中笔记文本 */
  private pickNotes(): Promise<TFile[]> {
    return new Promise((resolve) => {
      const files = this.plugin.app.vault.getMarkdownFiles();
      new MultiFileModal(this.plugin.app, files, this.t("integrate.picker.title"), (picked) => {
        resolve(picked.slice(0, MAX_PICK));
      }).open();
    });
  }

  private async noteInputs(files: TFile[]): Promise<Array<{ path: string; text: string }>> {
    const out: Array<{ path: string; text: string }> = [];
    for (const f of files) {
      out.push({ path: f.path, text: await this.plugin.app.vault.cachedRead(f) });
    }
    return out;
  }

  /* ---------- 多篇对比 ---------- */
  private async runCompare(body: HTMLElement): Promise<void> {
    const picked = await this.pickNotes();
    if (picked.length < 2) {
      new Notice(this.t("integrate.compare.needTwo"));
      return;
    }
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const result: CompareResult = await runCompare(this.plugin.transport, this.insightCfg(), await this.noteInputs(picked));
      this.clearResults(body);
      const box = body.createEl("div", { cls: "lingxi-results" });
      this.renderList(box, this.t("integrate.compare.consensus"), result.consensus);
      this.renderList(box, this.t("integrate.compare.divergence"), result.divergence);
      this.renderList(box, this.t("integrate.compare.complementary"), result.complementary);
      if (result.consensus.length + result.divergence.length + result.complementary.length === 0) {
        box.createEl("div", { cls: "lingxi-section-status", text: this.t("integrate.empty") });
      } else {
        this.saveNoteButton(box, () => this.compareToMarkdown(result), this.t("integrate.compare.save"));
      }
    } catch (err) {
      new Notice(this.plugin.t("chat.failed") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.setBusy(body, false);
    }
  }

  private renderList(box: HTMLElement, title: string, items: string[]): void {
    if (items.length === 0) return;
    box.createEl("div", { cls: "lingxi-result-heading", text: title });
    const ul = box.createEl("ul", { cls: "lingxi-result-list" });
    for (const item of items) ul.createEl("li", { text: item });
  }

  private compareToMarkdown(result: CompareResult): string {
    const zh = this.plugin.i18n.current === "zh";
    const lines: string[] = [`# ${zh ? "多篇对比" : "Note comparison"}`];
    lines.push(`## ${zh ? "共识" : "Consensus"}`);
    lines.push(...result.consensus.map((s) => `- ${s}`));
    lines.push(`## ${zh ? "分歧" : "Divergence"}`);
    lines.push(...result.divergence.map((s) => `- ${s}`));
    lines.push(`## ${zh ? "互补" : "Complementary"}`);
    lines.push(...result.complementary.map((s) => `- ${s}`));
    return lines.join("\n");
  }

  /* ---------- 主题合并 ---------- */
  private async runMerge(body: HTMLElement, topic: string | undefined): Promise<void> {
    const picked = await this.pickNotes();
    if (picked.length < 2) {
      new Notice(this.t("integrate.compare.needTwo"));
      return;
    }
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const draft = await runMerge(this.plugin.transport, this.insightCfg(), await this.noteInputs(picked), topic);
      this.clearResults(body);
      const box = body.createEl("div", { cls: "lingxi-results" });
      if (draft === "") {
        box.createEl("div", { cls: "lingxi-section-status", text: this.t("integrate.empty") });
        return;
      }
      const pre = box.createEl("pre", { cls: "lingxi-draft", text: draft });
      pre.scrollTop = 0;
      this.saveNoteButton(box, () => draft, this.t("integrate.merge.create"));
    } catch (err) {
      new Notice(this.plugin.t("chat.failed") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.setBusy(body, false);
    }
  }

  private saveNoteButton(box: HTMLElement, build: () => string, label: string): void {
    const btn = box.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: label });
    btn.addEventListener("click", () => {
      void (async () => {
        const content = build();
        const stamp = new Date().toISOString().slice(0, 10);
        let path = `lingxi-${stamp}.md`;
        let n = 1;
        while (await this.plugin.app.vault.adapter.exists(path)) {
          path = `lingxi-${stamp}-${n++}.md`;
        }
        await this.plugin.app.vault.create(path, content);
        await this.plugin.app.workspace.openLinkText(path.replace(/\.md$/, ""), "", false);
        new Notice(this.t("integrate.created"));
      })();
    });
  }

  /* ---------- 知识缺口 ---------- */
  private async runGaps(body: HTMLElement, rawQuestion: string): Promise<void> {
    const question = rawQuestion.trim();
    if (question === "") {
      new Notice(this.t("err.emptyQuestion"));
      return;
    }
    const indexer = this.plugin.indexer;
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const context = indexer && indexer.stats().vectors > 0 ? (await indexer.retrieve(question)).context.prompt : "";
      const result = await runGaps(this.plugin.transport, this.insightCfg(), question, context);
      this.clearResults(body);
      const box = body.createEl("div", { cls: "lingxi-results" });
      if (context === "") {
        box.createEl("div", { cls: "lingxi-section-status", text: this.t("rag.indexEmpty") });
      }
      this.renderList(box, this.t("integrate.gaps.gaps"), result.gaps);
      this.renderList(box, this.t("integrate.gaps.nextSteps"), result.nextSteps);
      if (result.gaps.length + result.nextSteps.length === 0) {
        box.createEl("div", { cls: "lingxi-section-status", text: this.t("integrate.empty") });
      }
    } catch (err) {
      new Notice(this.plugin.t("chat.failed") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.setBusy(body, false);
    }
  }
}
