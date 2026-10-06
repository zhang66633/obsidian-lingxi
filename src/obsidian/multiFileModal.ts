/**
 * 希XI — 多选笔记弹窗（整合功能用）
 * 为什么自己写：Obsidian 官方 FuzzySuggestModal 只能单选。
 * 大库保护：过滤后只渲染前 200 行，选过的集合独立于过滤。
 */

import { App, Modal, Setting, TFile } from "obsidian";

export class MultiFileModal extends Modal {
  private chosen = new Set<string>();
  private filtered: TFile[];

  constructor(
    app: App,
    private files: TFile[],
    private titleText: string,
    private done: (files: TFile[]) => void,
  ) {
    super(app);
    this.filtered = files;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lingxi-modal");
    contentEl.createEl("h3", { text: this.titleText });

    let query = "";
    const listEl = contentEl.createDiv( { cls: "lingxi-picker-list" });

    const renderList = () => {
      listEl.empty();
      const q = query.trim().toLowerCase();
      this.filtered = q
        ? this.files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 200)
        : this.files.slice(0, 200);
      for (const file of this.filtered) {
        const row = listEl.createEl("label", { cls: "lingxi-picker-row" });
        const cb = row.createEl("input", { attr: { type: "checkbox" } });
        cb.checked = this.chosen.has(file.path);
        cb.addEventListener("change", () => {
          if (cb.checked) this.chosen.add(file.path);
          else this.chosen.delete(file.path);
        });
        row.createSpan( { text: file.path });
      }
    };

    new Setting(contentEl).addSearch((s) => {
      s.setPlaceholder("搜索笔记…").onChange((v) => {
        query = v;
        renderList();
      });
    });

    renderList();

    const btns = contentEl.createDiv( { cls: "lingxi-modal-btns" });
    const cancel = btns.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => {
      this.chosen.clear();
      this.close();
    });
    const ok = btns.createEl("button", { cls: "mod-cta", text: "确定" });
    ok.addEventListener("click", () => this.close());
  }

  onClose(): void {
    const picked = this.files.filter((f) => this.chosen.has(f.path));
    this.done(picked);
    this.contentEl.empty();
  }
}
