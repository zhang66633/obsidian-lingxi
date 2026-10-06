/**
 * 希XI — Obsidian 侧 VaultPort 实现
 * 缓存落在插件目录：<configDir>/plugins/xi-qwen/cache.json
 * （configDir 跟随用户自定义的配置文件夹，不写死 .obsidian）
 */

import { App, TFile } from "obsidian";
import type { NoteFile, VaultPort } from "../core/vaultIndexer";

export class ObsidianVaultPort implements VaultPort {
  constructor(private app: App) {}

  private cachePath(): string {
    return `${this.app.vault.configDir}/plugins/xi-qwen/cache.json`;
  }

  private cacheDir(): string {
    return `${this.app.vault.configDir}/plugins/xi-qwen`;
  }

  listMarkdownFiles(): NoteFile[] {
    return this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime }));
  }

  async readNote(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return this.app.vault.cachedRead(file);
    return "";
  }

  async readCache(): Promise<string | null> {
    const path = this.cachePath();
    if (!(await this.app.vault.adapter.exists(path))) return null;
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  async writeCache(json: string): Promise<void> {
    const dir = this.cacheDir();
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    await this.app.vault.adapter.write(this.cachePath(), json);
  }
}
