/**
 * 希XI — 设置模型、默认值与合并
 * 默认接入学校网关（见 docs/01-决策记录.md D2）。
 */

import type { LangMode } from "./i18n";

export interface LingxiSettings {
  /** 界面语言；auto = 跟随 Obsidian locale */
  language: LangMode;
  /** OpenAI 兼容网关根地址，形如 https://host/v1 */
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  /** 输入 token 预算（含系统提示+检索+历史）；须 < 网关单次上限 */
  maxInputTokens: number;
  maxOutputTokens: number;
  topK: number;
  temperature: number;
  /** 索引排除的文件夹（vault 相对路径） */
  excludeFolders: string[];
  /** 半自动整理白名单：白名单内新笔记可自动写入，其余只出建议 */
  autoOrganizeFolders: string[];
  /** 语义相关度阈值（0-1），超过即视为相关 */
  similarityThreshold: number;
  /** RAG 上下文 token 预算（大于会话历史与系统提示） */
  contextBudgetTokens: number;
  /** 调试：Obsidian 启动时自动打开侧边栏（真机冒烟测试用） */
  autoOpenSidebar: boolean;
}

export const DEFAULT_SETTINGS: LingxiSettings = {
  language: "auto",
  baseUrl: "https://token.nau.edu.cn/v1",
  apiKey: "",
  chatModel: "qwen3.8-27b",
  embeddingModel: "qwen3-embedding-8b",
  maxInputTokens: 90000,
  maxOutputTokens: 8192,
  topK: 8,
  temperature: 0.3,
  excludeFolders: [".obsidian", ".trash", ".smart-env", ".git"],
  autoOrganizeFolders: [],
  similarityThreshold: 0.82,
  contextBudgetTokens: 12000,
  autoOpenSidebar: false,
};

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 || value.length === 0 ? out : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * 把 loadData() 可能的任意内容合并成合法设置。
 * 原则：用户已填的优先，缺字段回退默认，类型错误回退默认。
 */
export function mergeSettings(loaded: unknown): LingxiSettings {
  if (!loaded || typeof loaded !== "object") return { ...DEFAULT_SETTINGS };
  const l = loaded as Partial<LingxiSettings>;
  return {
    language: l.language === "zh" || l.language === "en" || l.language === "auto" ? l.language : DEFAULT_SETTINGS.language,
    baseUrl: typeof l.baseUrl === "string" && l.baseUrl.trim() !== "" ? l.baseUrl.replace(/\/+$/, "") : DEFAULT_SETTINGS.baseUrl,
    apiKey: typeof l.apiKey === "string" ? l.apiKey : "",
    chatModel: typeof l.chatModel === "string" && l.chatModel.trim() !== "" ? l.chatModel : DEFAULT_SETTINGS.chatModel,
    embeddingModel: typeof l.embeddingModel === "string" && l.embeddingModel.trim() !== "" ? l.embeddingModel : DEFAULT_SETTINGS.embeddingModel,
    maxInputTokens: asNumber(l.maxInputTokens, DEFAULT_SETTINGS.maxInputTokens),
    maxOutputTokens: asNumber(l.maxOutputTokens, DEFAULT_SETTINGS.maxOutputTokens),
    topK: Math.max(1, Math.min(20, asNumber(l.topK, DEFAULT_SETTINGS.topK))),
    temperature: Math.max(0, Math.min(2, asNumber(l.temperature, DEFAULT_SETTINGS.temperature))),
    excludeFolders: asStringArray(l.excludeFolders, DEFAULT_SETTINGS.excludeFolders),
    autoOrganizeFolders: asStringArray(l.autoOrganizeFolders, DEFAULT_SETTINGS.autoOrganizeFolders),
    similarityThreshold: Math.max(0, Math.min(1, asNumber(l.similarityThreshold, DEFAULT_SETTINGS.similarityThreshold))),
    contextBudgetTokens: Math.max(
      1000,
      Math.min(60000, asNumber(l.contextBudgetTokens, DEFAULT_SETTINGS.contextBudgetTokens)),
    ),
    autoOpenSidebar: asBoolean(l.autoOpenSidebar, DEFAULT_SETTINGS.autoOpenSidebar),
  };
}

/** 多行文本 → 文件夹列表（去空行、去重、去首尾空格） */
export function parseFolderList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const v = raw.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

export function folderListToText(list: string[]): string {
  return list.join("\n");
}
