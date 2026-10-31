// LLM layer. Two providers behind one function:
//  - Claude (ANTHROPIC_API_KEY, default): Messages API, web search server tool, Crustdata via the remote MCP connector.
//  - Gemini (GEMINI_API_KEY): generateContent, Google Search grounding, Crustdata via our own MCP client.
// Research data source: Crustdata when CRUSTDATA_API_KEY is set, otherwise live web search with cited URLs.
import { McpClient } from "./mcp";

const CRUSTDATA_MCP = "https://install.crustdata.com/mcp";
export type Source = { url: string; title?: string };
export type ClaudeResult = { text: string; toolCalls: { name: string; input: any }[]; sources: Source[]; usage: any; stop: string };
export type Opts = { system: string; prompt: string; crustdata?: boolean; web?: number; maxTokens?: number };

export function provider(): "gemini" | "anthropic" {
  const p = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (p === "gemini" || p === "anthropic") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}
export function model(p: string = provider()) {
  if (p === "gemini") return process.env.GEMINI_MODEL || (process.env.SD_MODEL && !process.env.SD_MODEL.startsWith("claude") ? process.env.SD_MODEL : "gemini-3.8-flash");
  return process.env.SD_MODEL && process.env.SD_MODEL.startsWith("claude") ? process.env.SD_MODEL : "claude-sonnet-5-5";
}
export function hasClaude() { return provider() === "gemini" ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY; }
export function hasCrustdata() { return !!process.env.CRUSTDATA_API_KEY; }
export function dataSource() { return hasCrustdata() ? "crustdata" : "web"; }

// Billing, quota or auth failures on one provider fall back to the other if its key exists.
const SWITCHABLE = /credit balance|billing|quota|RESOURCE_EXHAUSTED|rate.?limit|overloaded|API (401|403|429|529)|invalid x-api-key|authentication|PERMISSION_DENIED|UNAUTHENTICATED/i;
function friendly(msg: string, who: string) {
  return friendlyCore(msg, who) + ` [${msg.replace(/\s+/g, " ").slice(0, 220)}]`;
}
function friendlyCore(msg: string, who: string) {
  if (who === "Claude" && /credit balance|billing/i.test(msg)) return `${who}: the account has no credit. Add credit (console.anthropic.com > Plans & Billing) or add a working GEMINI_API_KEY in Vercel.`;
  if (/401|403|invalid x-api-key|authentication|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) return `${who}: the API key was rejected. Check it in Vercel > Settings > Environment Variables.`;
  if (/quota|RESOURCE_EXHAUSTED|429|rate.?limit/i.test(msg)) return `${who}: quota or rate limit reached. Wait a minute or raise the limit.`;
  return `${who} failed.`;
}
export async function claude(opts: Opts): Promise<ClaudeResult> {
  const first = provider();
  const run = (p: string) => (p === "gemini" ? gemini(opts) : anthropic(opts));
  try {
    return await run(first);
  } catch (e: any) {
    const other = first === "gemini" ? "anthropic" : "gemini";
    const otherKey = other === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
    const msg = String(e?.message || e);
    if (otherKey && SWITCHABLE.test(msg)) {
      try { return await run(other); }
      catch (e2: any) { throw new Error(`${friendly(msg, first === "gemini" ? "Gemini" : "Claude")} Fallback also failed. ${friendly(String(e2?.message || e2), other === "gemini" ? "Gemini" : "Claude")}`); }
    }
    throw new Error(friendly(msg, first === "gemini" ? "Gemini" : "Claude"));
  }
}

function addSource(list: Source[], url?: string, title?: string) {
  if (!url || list.some((s) => s.url === url)) return;
  list.push({ url, title });
}

// ---------------- Anthropic ----------------
async function anthropic(opts: Opts): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (Vercel > Project > Settings > Environment Variables).");
  const useMcp = !!opts.crustdata && hasCrustdata();
  const headers: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  if (useMcp) headers["anthropic-beta"] = "mcp-client-2025-11-20";
  const tools: any[] = [];
  const body0: any = {};
  if (useMcp) {
    body0.mcp_servers = [{ type: "url", url: CRUSTDATA_MCP, name: "crustdata", authorization_token: process.env.CRUSTDATA_API_KEY }];
    tools.push({ type: "mcp_toolset", mcp_server_name: "crustdata" });
  }
  if (opts.web) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: opts.web, user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata" } });
  const messages: any[] = [{ role: "user", content: opts.prompt }];
  const toolCalls: { name: string; input: any }[] = [];
  const sources: Source[] = [];
  let last: any = null;
  const texts: string[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const body: any = { ...body0, model: model("anthropic"), max_tokens: opts.maxTokens || 8000, system: opts.system, messages };
    if (tools.length) body.tools = tools;
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    for (const b of last.content || []) {
      if (b.type === "mcp_tool_use" || b.type === "server_tool_use") toolCalls.push({ name: b.name, input: b.input });
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) addSource(sources, r.url, r.title);
      if (b.type === "text") {
        texts.push(b.text);
        for (const c of b.citations || []) addSource(sources, c.url, c.title);
      }
    }
    if (last.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: last.content }); continue; }
    break;
  }
  // The final answer is the text of the last response (earlier turns may hold partial narration).
  const finalText = (last?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { text: finalText || texts.join("\n"), toolCalls, sources, usage: last?.usage, stop: last?.stop_reason };
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

async function gemini(opts: Opts): Promise<ClaudeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (Vercel > Project > Settings > Environment Variables).");
  const toolCalls: { name: string; input: any }[] = [];
  const sources: Source[] = [];
  let mcp: McpClient | null = null;
  const nameMap = new Map<string, string>();
  let tools: any[] | undefined;
  if (opts.crustdata && hasCrustdata()) {
    mcp = new McpClient(CRUSTDATA_MCP, process.env.CRUSTDATA_API_KEY as string);
    await mcp.init();
    const decls = (await mcp.tools()).slice(0, 120).map((t) => {
      const n = safeName(t.name);
      nameMap.set(n, t.name);
      return { name: n, description: (t.description || "").slice(0, 1000), parametersJsonSchema: cleanSchema(t.inputSchema) };
    });
    if (decls.length) tools = [{ functionDeclarations: decls }];
  } else if (opts.web) {
    tools = [{ google_search: {} }];
  }
  const contents: any[] = [{ role: "user", parts: [{ text: opts.prompt }] }];
  let last: any = null;
  let text = "";
  for (let turn = 0; turn < 16; turn++) {
    const body: any = { systemInstruction: { parts: [{ text: opts.system }] }, contents, generationConfig: { maxOutputTokens: Math.max(opts.maxTokens || 8000, 2048) } };
    if (tools) body.tools = tools;
    const res = await fetch(`${GEMINI}/${model("gemini")}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    const cand = last.candidates?.[0];
    for (const ch of cand?.groundingMetadata?.groundingChunks || []) addSource(sources, ch.web?.uri, ch.web?.title);
    for (const q of cand?.groundingMetadata?.webSearchQueries || []) toolCalls.push({ name: "google_search", input: { query: q } });
    const parts: any[] = cand?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (!calls.length || !mcp) break;
    contents.push(cand.content);
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
  return { text, toolCalls, sources, usage: last?.usageMetadata, stop: last?.candidates?.[0]?.finishReason || "" };
}

/** Pull the last JSON object out of a model answer (<json> tags, ```json fences, or bare braces). */
export function extractJson<T = any>(text: string): T | null {
  const tries: string[] = [];
  const tags = [...text.matchAll(/<json>([\s\S]*?)<\/json>/gi)].map((m) => m[1]);
  tries.push(...tags.reverse());
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  tries.push(...fences.reverse());
  const first = text.indexOf("{"), lastB = text.lastIndexOf("}");
  if (first >= 0 && lastB > first) tries.push(text.slice(first, lastB + 1));
  for (const t of tries) {
    try { return JSON.parse(t.trim()) as T; } catch { /* next */ }
  }
  return null;
}

export async function claudeJson<T = any>(opts: Opts): Promise<{ data: T; raw: ClaudeResult }> {
  const raw = await claude(opts);
  let data = extractJson<T>(raw.text);
  if (!data) {
    const fix = await claude({ system: "You convert text to valid JSON. Output only the JSON object inside <json></json> tags.", prompt: `Convert this answer into the JSON the task asked for. Keep every fact and URL, invent nothing.\n\n${raw.text.slice(0, 20000)}`, maxTokens: 6000 });
    data = extractJson<T>(fix.text);
  }
  if (!data) throw new Error("The model did not return valid JSON. First 300 chars: " + raw.text.slice(0, 300));
  return { data, raw };
}
