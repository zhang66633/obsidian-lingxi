/**
 * 灵犀 Lingxi — 整合功能的提示词与解析（纯 TS）
 *
 * 三个功能都让模型输出 JSON：比较（共识/分歧/互补）、合并（结构化草稿）、
 * 缺口（缺什么/下一步查什么）。输出解析一律宽容（围栏/散文都能捞），
 * 校验严格（字段缺失给空数组，绝不给半成品结构）。
 */

import { chatCompletion } from "./llm";
import type { ChatMessage, Transport } from "./llm";

export interface NoteInput {
  path: string;
  text: string;
}

export interface InsightConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  language?: "zh" | "en";
  maxOutputTokens?: number;
}

/* ---------------- 比较 ---------------- */

export interface CompareResult {
  consensus: string[];
  divergence: string[];
  complementary: string[];
}

export function buildComparePrompt(notes: NoteInput[], lang: "zh" | "en"): string {
  const header =
    lang === "zh"
      ? "下面给出若干篇同一主题的笔记。请跨笔记比较，只输出 JSON：" +
        '{"consensus":["共识点"],"divergence":["分歧点（注明出自哪篇）"],"complementary":["互补点（各自提供了什么）"]}。'
      : "Below are several notes on one topic. Compare across them, output JSON only: " +
        '{"consensus":["..."],"divergence":["... (note which note differs)"],"complementary":["..."]}.';
  const body = notes
    .map((n, i) => `### ${i + 1}. ${n.path}\n${n.text.slice(0, 4000)}`)
    .join("\n\n");
  return `${header}\n\n${body}`;
}

export function parseCompareResult(text: string): CompareResult {
  const obj = extractJsonObject(text);
  return {
    consensus: asStringArray(obj?.consensus),
    divergence: asStringArray(obj?.divergence),
    complementary: asStringArray(obj?.complementary),
  };
}

/* ---------------- 合并 ---------------- */

export function buildMergePrompt(notes: NoteInput[], topic: string | undefined, lang: "zh" | "en"): string {
  const header =
    lang === "zh"
      ? "把下面若干篇笔记合并成一篇结构化的合并草稿（Markdown）。" +
        "要求：按主题重组而非按来源堆叠；每个观点后用 (来源: 笔记路径) 标注；" +
        "冲突处并列呈现并标注分歧；结尾留「待澄清问题」小节。只输出 Markdown 正文。"
      : "Merge the notes below into one structured Markdown draft. " +
        "Reorganize by theme, not by source; annotate each point with (source: path); " +
        "present conflicts side by side; end with an Open Questions section. Markdown body only.";
  const topicLine = topic ? (lang === "zh" ? `主题：${topic}\n\n` : `Topic: ${topic}\n\n`) : "";
  const body = notes.map((n, i) => `### ${i + 1}. ${n.path}\n${n.text.slice(0, 4000)}`).join("\n\n");
  return `${topicLine}${header}\n\n${body}`;
}

export function parseMergeDraft(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" ? "" : trimmed;
}

/* ---------------- 知识缺口 ---------------- */

export interface GapResult {
  gaps: string[];
  nextSteps: string[];
}

export function buildGapPrompt(question: string, context: string, lang: "zh" | "en"): string {
  if (lang === "zh") {
    return (
      "用户的问题和库里检索到的相关片段如下。请判断：要完整回答这个问题，" +
      "库里缺少哪些信息？只输出 JSON：" +
      '{"gaps":["缺少的信息"],"nextSteps":["下一步该查什么/写什么"]}。\n\n' +
      `问题：${question}\n\n${context}`
    );
  }
  return (
    "Below is the user's question and the excerpts retrieved from their vault. " +
    "Decide: what information is missing to answer it fully? Output JSON only: " +
    '{"gaps":["missing information"],"nextSteps":["what to research or write next"]}.\n\n' +
    `Question: ${question}\n\n${context}`
  );
}

export function parseGapResult(text: string): GapResult {
  const obj = extractJsonObject(text);
  return { gaps: asStringArray(obj?.gaps), nextSteps: asStringArray(obj?.nextSteps) };
}

/* ---------------- 编排（transport 注入，可单测） ---------------- */

export async function runCompare(transport: Transport, cfg: InsightConfig, notes: NoteInput[]): Promise<CompareResult> {
  const lang = cfg.language ?? "zh";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        lang === "zh"
          ? "你是比较分析助手。只输出 JSON，不要解释。"
          : "You are a comparison assistant. Output JSON only, no explanation.",
    },
    { role: "user", content: buildComparePrompt(notes, lang) },
  ];
  const raw = await chatCompletion(
    transport,
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, chatModel: cfg.chatModel },
    messages,
    { temperature: 0.3, maxTokens: cfg.maxOutputTokens ?? 4096 },
  );
  return parseCompareResult(raw);
}

export async function runMerge(
  transport: Transport,
  cfg: InsightConfig,
  notes: NoteInput[],
  topic?: string,
): Promise<string> {
  const lang = cfg.language ?? "zh";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        lang === "zh"
          ? "你是知识整合助手，输出结构化 Markdown 草稿。"
          : "You are a knowledge-integrating assistant; output a structured Markdown draft.",
    },
    { role: "user", content: buildMergePrompt(notes, topic, lang) },
  ];
  const raw = await chatCompletion(
    transport,
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, chatModel: cfg.chatModel },
    messages,
    { temperature: 0.4, maxTokens: cfg.maxOutputTokens ?? 8192 },
  );
  return parseMergeDraft(raw);
}

export async function runGaps(
  transport: Transport,
  cfg: InsightConfig,
  question: string,
  context: string,
): Promise<GapResult> {
  const lang = cfg.language ?? "zh";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        lang === "zh"
          ? "你是知识缺口分析助手。只输出 JSON，不要解释。"
          : "You are a knowledge-gap analyst. Output JSON only, no explanation.",
    },
    { role: "user", content: buildGapPrompt(question, context, lang) },
  ];
  const raw = await chatCompletion(
    transport,
    { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, chatModel: cfg.chatModel },
    messages,
    { temperature: 0.3, maxTokens: cfg.maxOutputTokens ?? 2048 },
  );
  return parseGapResult(raw);
}

/* ---------------- 内部工具 ---------------- */

/** 从模型输出里抠第一个 JSON 对象（围栏/散文/裸 JSON 均可） */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}
