/**
 * 希XI — 整理面板（Obsidian 侧 UI）
 *
 * 半自动写权限语义（哲的选择，docs D4）：
 * 当前笔记位于 autoOrganizeFolders 白名单内 → 标签建议直接应用；
 * 白名单外 → 只出建议芯片，点一下才写入 frontmatter。
 */

import { Notice, TFile } from "obsidian";
import type LingxiPlugin from "../main";
import type { DuplicatePair, RelatedNote } from "../core/related";

export class OrganizePanel {
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

  render(): void {
    const c = this.container;
    c.empty();
    c.addClass("lingxi-organize");

    const noteEl = c.createEl("div", { cls: "lingxi-org-current" });
    const file = this.plugin.app.workspace.getActiveFile();
    noteEl.setText(`${this.t("organize.currentNote")}：${file ? file.path : this.t("organize.noNote")}`);

    this.section("organize.related", "organize.related.hint", (body) => {
      const btn = body.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("organize.related.run") });
      btn.addEventListener("click", () => void this.runRelated(body));
    });

    this.section("organize.search", "organize.search.hint", (body) => {
      const row = body.createEl("div", { cls: "lingxi-org-row" });
      const input = row.createEl("input", { cls: "lingxi-org-input", attr: { placeholder: this.t("organize.search.placeholder") } });
      const btn = row.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("organize.search.run") });
      const go = () => void this.runSearch(body, input.value);
      btn.addEventListener("click", go);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") go();
      });
    });

    this.section("organize.tags", "organize.tags.hint", (body) => {
      const btn = body.createEl("button", { cls: "lingxi-mini-btn mod-cta", text: this.t("organize.tags.run") });
      btn.addEventListener("click", () => void this.runTags(body));
    });

    this.section("organize.dup", "organize.dup.hint", (body) => {
      const btn = body.createEl("button", { cls: "lingxi-mini-btn", text: this.t("organize.dup.run") });
      btn.addEventListener("click", () => void this.runDuplicates(body));
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
    if (busy && text) {
      const status = body.createEl("div", { cls: "lingxi-section-status", text });
      status.dataset.busy = "1";
    } else {
      for (const el of Array.from(body.querySelectorAll(".lingxi-section-status"))) el.remove();
    }
  }

  private clearBusy(body: HTMLElement): void {
    for (const el of Array.from(body.querySelectorAll(".lingxi-section-status"))) el.remove();
  }

  private noteRow(
    body: HTMLElement,
    label: string,
    score: number | null,
    onOpen: () => void,
    extra?: (row: HTMLElement) => void,
  ): void {
    const row = body.createEl("div", { cls: "lingxi-result-row" });
    const main = row.createEl("button", { cls: "lingxi-result-main" });
    main.createEl("span", { cls: "lingxi-result-label", text: label });
    if (score !== null) {
      main.createEl("span", { cls: "lingxi-score", text: score.toFixed(2) });
    }
    main.addEventListener("click", onOpen);
    extra?.(row);
  }

  /* ---------- 相关笔记 ---------- */
  private async runRelated(body: HTMLElement): Promise<void> {
    const indexer = this.plugin.indexer;
    const file = this.plugin.app.workspace.getActiveFile();
    if (!indexer || !file) {
      new Notice(this.t("organize.noNote"));
      return;
    }
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const list: RelatedNote[] = await indexer.relatedNotesFor(file.path, { topN: 10 });
      this.clearBusy(body);
      for (const el of Array.from(body.querySelectorAll(".lingxi-results"))) el.remove();
      if (list.length === 0) {
        body.createEl("div", { cls: "lingxi-section-status", text: this.t("organize.related.none") });
        return;
      }
      const box = body.createEl("div", { cls: "lingxi-results" });
      for (const item of list) {
        this.noteRow(box, item.path, item.score, () => this.openPath(item.path), (row) => {
          const ins = row.createEl("button", {
            cls: "lingxi-mini-btn",
            text: this.t("organize.related.insert"),
          });
          ins.addEventListener("click", () => this.insertLink(item.path));
        });
      }
    } catch (err) {
      this.clearBusy(body);
      new Notice(errMsg(err));
    } finally {
      this.setBusy(body, false);
    }
  }

  /* ---------- 语义搜索 ---------- */
  private async runSearch(body: HTMLElement, query: string): Promise<void> {
    const indexer = this.plugin.indexer;
    if (!indexer || query.trim() === "") return;
    if (indexer.stats().vectors === 0) {
      new Notice(this.t("rag.indexEmpty"));
      return;
    }
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const { hits } = await indexer.retrieve(query.trim());
      this.clearBusy(body);
      for (const el of Array.from(body.querySelectorAll(".lingxi-results"))) el.remove();
      if (hits.length === 0) {
        body.createEl("div", { cls: "lingxi-section-status", text: this.t("organize.search.none") });
        return;
      }
      const box = body.createEl("div", { cls: "lingxi-results" });
      for (const hit of hits) {
        const chunk = indexer.index.getChunk(hit.id);
        if (!chunk) continue;
        const label = chunk.heading ? `${chunk.path} › ${chunk.heading}` : chunk.path;
        this.noteRow(box, label, hit.score, () => this.openPath(chunk.path));
      }
    } catch (err) {
      this.clearBusy(body);
      new Notice(errMsg(err));
    } finally {
      this.setBusy(body, false);
    }
  }

  /* ---------- 标签建议 ---------- */
  private async runTags(body: HTMLElement): Promise<void> {
    const indexer = this.plugin.indexer;
    const file = this.plugin.app.workspace.getActiveFile();
    if (!indexer || !file) {
      new Notice(this.t("organize.noNote"));
      return;
    }
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const tags = await indexer.suggestTags(file.path);
      this.clearBusy(body);
      for (const el of Array.from(body.querySelectorAll(".lingxi-results"))) el.remove();
      if (tags.length === 0) {
        body.createEl("div", { cls: "lingxi-section-status", text: this.t("organize.tags.none") });
        return;
      }
      const auto = this.inAutoFolder(file);
      if (auto) {
        // 白名单内：半自动直接应用
        for (const tag of tags) await this.applyTag(file, tag);
        const box = body.createEl("div", { cls: "lingxi-results" });
        box.createEl("div", { cls: "lingxi-section-status", text: `${this.t("organize.tags.applied")}：${tags.join(" ")}` });
        return;
      }
      const box = body.createEl("div", { cls: "lingxi-results lingxi-chips" });
      for (const tag of tags) {
        const chip = box.createEl("button", { cls: "lingxi-chip", text: `#${tag}` });
        chip.setAttribute("title", this.t("organize.tags.apply"));
        chip.addEventListener("click", () => {
          void this.applyTag(file, tag).then(() => {
            chip.disabled = true;
            chip.addClass("is-applied");
          });
        });
      }
    } catch (err) {
      this.clearBusy(body);
      new Notice(errMsg(err));
    } finally {
      this.setBusy(body, false);
    }
  }

  private inAutoFolder(file: TFile): boolean {
    const folders = this.plugin.settings.autoOrganizeFolders;
    const path = file.path.replace(/\\/g, "/");
    return folders.some((f) => {
      const ff = f.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      return ff !== "" && (path === ff || path.startsWith(`${ff}/`));
    });
  }

  private async applyTag(file: TFile, tag: string): Promise<void> {
    await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const raw = fm.tags;
      const current: string[] = Array.isArray(raw)
        ? raw.map((v) => String(v))
        : typeof raw === "string"
          ? [raw]
          : [];
      if (!current.includes(tag)) {
        fm.tags = [...current, tag];
      }
    });
  }

  /* ---------- 近似重复 ---------- */
  private async runDuplicates(body: HTMLElement): Promise<void> {
    const indexer = this.plugin.indexer;
    if (!indexer) return;
    this.setBusy(body, true, this.t("organize.busy"));
    try {
      const pairs: DuplicatePair[] = indexer.duplicates();
      this.clearBusy(body);
      for (const el of Array.from(body.querySelectorAll(".lingxi-results"))) el.remove();
      if (pairs.length === 0) {
        body.createEl("div", { cls: "lingxi-section-status", text: this.t("organize.dup.none") });
        return;
      }
      const box = body.createEl("div", { cls: "lingxi-results" });
      for (const pair of pairs.slice(0, 20)) {
        this.noteRow(box, `${pair.a} ↔ ${pair.b}`, pair.score, () => this.openPath(pair.a), (row) => {
          const open = row.createEl("button", { cls: "lingxi-mini-btn", text: this.t("organize.dup.openBoth") });
          open.addEventListener("click", () => {
            void this.plugin.app.workspace.openLinkText(pair.a.replace(/\.md$/, ""), "", false);
            void this.plugin.app.workspace.openLinkText(pair.b.replace(/\.md$/, ""), "", true);
          });
        });
      }
    } catch (err) {
      this.clearBusy(body);
      new Notice(errMsg(err));
    } finally {
      this.setBusy(body, false);
    }
  }

  /* ---------- 工具 ---------- */
  private openPath(path: string): void {
    void this.plugin.app.workspace.openLinkText(path.replace(/\.md$/, ""), "", false);
  }

  private insertLink(path: string): void {
    const editor = this.plugin.app.workspace.activeEditor?.editor;
    if (!editor) {
      new Notice(this.t("organize.noNote"));
      return;
    }
    editor.replaceSelection(`[[${path.replace(/\.md$/, "")}]]`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
