/**
 * 希XI — Obsidian 侧 VaultPort 实现
 * 缓存落在插件目录：.obsidian/plugins/lingxi/cache.json
 */

import { App, TFile } from "obsidian";
import type { NoteFile, VaultPort } from "../core/vaultIndexer";

const CACHE_PATH = ".obsidian/plugins/lingxi/cache.json";

export class ObsidianVaultPort implements VaultPort {
  constructor(private app: App) {}

  listMarkdownFiles(): NoteFile[] {
    return this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime }));
  }

  async readNote(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return this.app.vault.cachedRead(file);
    return "";
  }

  async readCache(): Promise<string | null> {
    if (!(await this.app.vault.adapter.exists(CACHE_PATH))) return null;
    try {
      return await this.app.vault.adapter.read(CACHE_PATH);
    } catch {
      return null;
    }
  }

  async writeCache(json: string): Promise<void> {
    const dir = ".obsidian/plugins/lingxi";
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    await this.app.vault.adapter.write(CACHE_PATH, json);
  }
}
