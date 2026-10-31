// Claude Messages API via fetch, with the Crustdata MCP server attached when asked.
const API = "https://api.anthropic.com/v1/messages";
const MCP_BETA = "mcp-client-2025-11-20";
const CRUSTDATA_MCP = "https://install.crustdata.com/mcp";

export type ClaudeResult = { text: string; toolCalls: { name: string; input: any }[]; usage: any; stop: string };

export function model() {
  return process.env.SD_MODEL || "claude-sonnet-5-5";
}
export function hasClaude() { return !!process.env.ANTHROPIC_API_KEY; }
export function hasCrustdata() { return !!process.env.CRUSTDATA_API_KEY; }

export async function claude(opts: { system: string; prompt: string; crustdata?: boolean; maxTokens?: number }): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (Vercel > Project > Settings > Environment Variables).");
  const useMcp = !!opts.crustdata && hasCrustdata();
  const headers: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  if (useMcp) headers["anthropic-beta"] = MCP_BETA;
  const messages: any[] = [{ role: "user", content: opts.prompt }];
  const toolCalls: { name: string; input: any }[] = [];
  let last: any = null;
  for (let turn = 0; turn < 6; turn++) {
    const body: any = { model: model(), max_tokens: opts.maxTokens || 8000, system: opts.system, messages };
    if (useMcp) {
      body.mcp_servers = [{ type: "url", url: CRUSTDATA_MCP, name: "crustdata", authorization_token: process.env.CRUSTDATA_API_KEY }];
      body.tools = [{ type: "mcp_toolset", mcp_server_name: "crustdata" }];
    }
    const res = await fetch(API, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    for (const b of last.content || []) if (b.type === "mcp_tool_use") toolCalls.push({ name: b.name, input: b.input });
    if (last.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: last.content });
      continue;
    }
    break;
  }
  const text = (last?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return { text, toolCalls, usage: last?.usage, stop: last?.stop_reason };
}

/** Pull the last JSON object out of a model answer (```json fences, <json> tags, or bare braces). */
export function extractJson<T = any>(text: string): T | null {
  const tries: string[] = [];
  const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tag) tries.push(tag[1]);
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  tries.push(...fences.reverse());
  const first = text.indexOf("{"), lastB = text.lastIndexOf("}");
  if (first >= 0 && lastB > first) tries.push(text.slice(first, lastB + 1));
  for (const t of tries) {
    try { return JSON.parse(t.trim()) as T; } catch { /* next */ }
  }
  return null;
}

export async function claudeJson<T = any>(opts: { system: string; prompt: string; crustdata?: boolean; maxTokens?: number }): Promise<{ data: T; raw: ClaudeResult }> {
  const raw = await claude(opts);
  let data = extractJson<T>(raw.text);
  if (!data) {
    const fix = await claude({ system: "You convert text to valid JSON. Output only the JSON object inside <json></json> tags.", prompt: `Convert this answer into the JSON the task asked for. Keep every fact, invent nothing.\n\n${raw.text.slice(0, 20000)}`, maxTokens: 6000 });
    data = extractJson<T>(fix.text);
  }
  if (!data) throw new Error("Claude did not return valid JSON. First 300 chars: " + raw.text.slice(0, 300));
  return { data, raw };
}
