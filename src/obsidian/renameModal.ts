/**
 * 灵犀 Lingxi — 重命名会话弹窗
 * 不用 window.prompt：Electron 里行为不稳，且样式不可控。
 * 关闭路径分级：Enter / 「确定」= 保存新标题；Esc / 遮罩 / 「取消」= 放弃修改。
 */

import { App, Modal } from "obsidian";

export class RenameModal extends Modal {
  private value: string;
  private settled = false;

  constructor(
    app: App,
    currentTitle: string,
    private done: (newTitle: string | null) => void,
  ) {
    super(app);
    this.value = currentTitle;
  }

  private finish(result: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.done(result);
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lingxi-modal");
    contentEl.createEl("h3", { text: "重命名会话 / Rename session" });

    const input = contentEl.createEl("input", { cls: "lingxi-org-input" });
    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        const t = this.value.trim();
        this.finish(t === "" ? null : t);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this.finish(null);
      }
    });
    setTimeout(() => input.focus(), 50);

    const btns = contentEl.createEl("div", { cls: "lingxi-modal-btns" });
    const cancel = btns.createEl("button", { text: "取消 / Cancel" });
    cancel.addEventListener("click", () => this.finish(null));
    const ok = btns.createEl("button", { cls: "mod-cta", text: "确定 / Save" });
    ok.addEventListener("click", () => {
      const t = this.value.trim();
      this.finish(t === "" ? null : t);
    });
  }

  onClose(): void {
    this.contentEl.empty();
    // 兜底：任何未沉降的关闭路径都算取消
    this.finish(null);
  }
}
