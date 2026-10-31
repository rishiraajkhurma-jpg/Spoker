// LLM layer. Two providers behind one function:
//  - Gemini (GEMINI_API_KEY): native generateContent + function calling; Crustdata tools via our own MCP client.
//  - Claude (ANTHROPIC_API_KEY): Messages API with the remote MCP connector.
// LLM_PROVIDER=gemini|anthropic forces one; otherwise Claude is used when ANTHROPIC_API_KEY is set, else Gemini.
import { McpClient } from "./mcp";

const CRUSTDATA_MCP = "https://install.crustdata.com/mcp";
export type ClaudeResult = { text: string; toolCalls: { name: string; input: any }[]; usage: any; stop: string };

export function provider(): "gemini" | "anthropic" {
  const p = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (p === "gemini" || p === "anthropic") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}
export function model() {
  if (process.env.SD_MODEL && !(provider() === "gemini" && process.env.SD_MODEL.startsWith("claude"))) return process.env.SD_MODEL;
  return provider() === "gemini" ? (process.env.GEMINI_MODEL || "gemini-3.8-flash") : "claude-sonnet-5-5";
}
export function hasClaude() { return provider() === "gemini" ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY; }
export function hasCrustdata() { return !!process.env.CRUSTDATA_API_KEY; }

export async function claude(opts: { system: string; prompt: string; crustdata?: boolean; maxTokens?: number }): Promise<ClaudeResult> {
  return provider() === "gemini" ? gemini(opts) : anthropic(opts);
}

// ---------------- Gemini ----------------
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^([^a-zA-Z_])/, "_$1").slice(0, 63);

function cleanSchema(s: any): any {
  if (!s || typeof s !== "object") return { type: "object", properties: {} };
  const out = JSON.parse(JSON.stringify(s));
  delete out.$schema;
  if (!out.type) out.type = "object";
  return out;
}

async function gemini(opts: { system: string; prompt: string; crustdata?: boolean; maxTokens?: number }): Promise<ClaudeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (Vercel > Project > Settings > Environment Variables).");
  const toolCalls: { name: string; input: any }[] = [];
  let mcp: McpClient | null = null;
  const nameMap = new Map<string, string>();
  let tools: any[] | undefined;
  if (opts.crustdata && hasCrustdata()) {
    mcp = new McpClient(CRUSTDATA_MCP, process.env.CRUSTDATA_API_KEY as string);
    await mcp.init();
    const list = await mcp.tools();
    const decls = list.slice(0, 120).map((t) => {
      const n = safeName(t.name);
      nameMap.set(n, t.name);
      return { name: n, description: (t.description || "").slice(0, 1000), parametersJsonSchema: cleanSchema(t.inputSchema) };
    });
    if (decls.length) tools = [{ functionDeclarations: decls }];
  }
  const contents: any[] = [{ role: "user", parts: [{ text: opts.prompt }] }];
  let last: any = null;
  let text = "";
  for (let turn = 0; turn < 16; turn++) {
    const body: any = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: { maxOutputTokens: Math.max(opts.maxTokens || 8000, 2048) },
    };
    if (tools) body.tools = tools;
    const res = await fetch(`${GEMINI}/${model()}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    const cand = last.candidates?.[0];
    const parts: any[] = cand?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (!calls.length || !mcp) break;
    contents.push(cand.content); // keep thought signatures intact
    const responses: any[] = [];
    for (const p of calls) {
      const real = nameMap.get(p.functionCall.name) || p.functionCall.name;
      toolCalls.push({ name: real, input: p.functionCall.args });
      let result: string;
      try { result = await mcp.call(real, p.functionCall.args || {}); } catch (e: any) { result = "ERROR: " + e.message; }
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result: result.slice(0, 24000) } } });
    }
    contents.push({ role: "user", parts: responses });
    if (turn === 14) contents.push({ role: "user", parts: [{ text: "Stop calling tools now and give your final answer in the requested format." }] });
  }
  return { text, toolCalls, usage: last?.usageMetadata, stop: last?.candidates?.[0]?.finishReason || "" };
}

// ---------------- Anthropic ----------------
async function anthropic(opts: { system: string; prompt: string; crustdata?: boolean; maxTokens?: number }): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (Vercel > Project > Settings > Environment Variables).");
  const useMcp = !!opts.crustdata && hasCrustdata();
  const headers: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  if (useMcp) headers["anthropic-beta"] = "mcp-client-2025-11-20";
  const messages: any[] = [{ role: "user", content: opts.prompt }];
  const toolCalls: { name: string; input: any }[] = [];
  let last: any = null;
  for (let turn = 0; turn < 6; turn++) {
    const body: any = { model: model(), max_tokens: opts.maxTokens || 8000, system: opts.system, messages };
    if (useMcp) {
      body.mcp_servers = [{ type: "url", url: CRUSTDATA_MCP, name: "crustdata", authorization_token: process.env.CRUSTDATA_API_KEY }];
      body.tools = [{ type: "mcp_toolset", mcp_server_name: "crustdata" }];
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    for (const b of last.content || []) if (b.type === "mcp_tool_use") toolCalls.push({ name: b.name, input: b.input });
    if (last.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: last.content }); continue; }
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
  if (!data) throw new Error("The model did not return valid JSON. First 300 chars: " + raw.text.slice(0, 300));
  return { data, raw };
}
