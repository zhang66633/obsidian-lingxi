/**
 * 希XI — Obsidian 侧 HTTP 传输实现
 * 用 requestUrl（Electron 层）而不是 fetch：学校网关不返回 CORS 头，
 * 渲染层 fetch 会被拦截（docs/01-决策记录.md D3）。
 */

import { requestUrl } from "obsidian";
import type { Transport } from "../core/llm";
import { buildHeaders, buildModelsUrl } from "../core/llm";
import { LlmError } from "../core/llm";

export const requestUrlTransport: Transport = {
  async postJson(url, headers, body, timeoutMs = 180_000) {
    const res = await requestUrl({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      throw: false,
    });
    let json: unknown = null;
    const anyRes = res as unknown as { json?: unknown };
    if (anyRes.json !== undefined && anyRes.json !== null) {
      json = anyRes.json;
    } else {
      try {
        json = JSON.parse(res.text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, json };
  },
};

/** GET /models 探测连接，返回模型 id 列表（供设置页「测试连接」） */
export async function fetchModelIds(cfg: { baseUrl: string; apiKey: string }): Promise<string[]> {
  const res = await requestUrl({
    url: buildModelsUrl(cfg.baseUrl),
    method: "GET",
    headers: buildHeaders(cfg.apiKey),
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new LlmError(`HTTP ${res.status}: ${res.text.slice(0, 200)}`, res.status);
  }
  let json: unknown;
  try {
    json = res.json as unknown;
  } catch {
    json = JSON.parse(res.text);
  }
  if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
    const data = (json as { data: Array<{ id?: unknown }> }).data;
    return data.map((m) => (typeof m.id === "string" ? m.id : "")).filter((id) => id !== "");
  }
  return [];
}
