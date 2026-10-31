// LLM layer. Three providers behind one function:
//  - Claude (ANTHROPIC_API_KEY): Messages API, web search server tool, Crustdata via the remote MCP connector.
//  - Gemini (GEMINI_API_KEY): generateContent, Google Search grounding, Crustdata via our own MCP client.
//  - OpenRouter (OPENROUTER_API_KEY): OpenAI-compatible API, Crustdata via our own MCP client.
// Research data source: Crustdata when CRUSTDATA_API_KEY is set, otherwise live web search with cited URLs.
import { McpClient } from "./mcp";

const CRUSTDATA_MCP = "https://install.crustdata.com/mcp";
export type Source = { url: string; title?: string; supports?: string; verified?: boolean; how?: string };
export type ClaudeResult = { text: string; toolCalls: { name: string; input: any }[]; sources: Source[]; usage: any; stop: string; seen?: string[] };
export type Opts = { system: string; prompt: string; crustdata?: boolean; web?: number; maxTokens?: number; budgetMs?: number; deadline?: number };

// Vercel stops a function at 300 s. Every call gets a hard deadline; tools stop early enough to leave time for the answer.
const HARD_MS = 240000, ANSWER_MS = 95000, TOOL_CALL_MS = 50000;
const left = (o: Opts) => (o.deadline as number) - Date.now();
const toolTimeUp = (o: Opts, started: number) => Date.now() - started > (o.budgetMs || 140000) || left(o) < ANSWER_MS;
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(what + " timed out")), Math.max(1000, ms)))]);
}
const sig = (o: Opts) => AbortSignal.timeout(Math.max(5000, left(o)));

/** OpenAI-compatible endpoint: KIMI_K3 (an OpenRouter sk-or- key, or a Moonshot key) wins over OPENROUTER_API_KEY. Default model: Kimi K3. */
export function orConfig() {
  const kimi = process.env.KIMI_K3 || process.env.KIMI_API_KEY || "";
  if (kimi) {
    const viaOR = kimi.startsWith("sk-or-");
    return { key: kimi, openrouter: viaOR, base: viaOR ? "https://openrouter.ai/api/v1" : (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"),
      model: (viaOR ? process.env.OPENROUTER_MODEL : process.env.KIMI_MODEL) || (viaOR ? "moonshotai/kimi-k3" : "kimi-k3"), label: viaOR ? "OpenRouter" : "Moonshot" };
  }
  return { key: process.env.OPENROUTER_API_KEY || "", openrouter: true, base: "https://openrouter.ai/api/v1", model: process.env.OPENROUTER_MODEL || "moonshotai/kimi-k3", label: "OpenRouter" };
}
export function provider(): "gemini" | "anthropic" | "openrouter" {
  const p = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (p === "gemini" || p === "anthropic" || p === "openrouter") return p as any;
  if (orConfig().key) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}
export function model(p: string = provider()) {
  if (p === "openrouter") return orConfig().model;
  if (p === "gemini") return process.env.GEMINI_MODEL || (process.env.SD_MODEL && !process.env.SD_MODEL.startsWith("claude") ? process.env.SD_MODEL : "gemini-3.8-flash");
  return process.env.SD_MODEL && process.env.SD_MODEL.startsWith("claude") ? process.env.SD_MODEL : "claude-sonnet-5-5";
}
export function hasClaude() {
  const p = provider();
  if (p === "openrouter") return !!orConfig().key;
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}
export function hasCrustdata() { return !!process.env.CRUSTDATA_API_KEY; }
export function dataSource() { return hasCrustdata() ? "crustdata" : "web"; }

// Billing, quota or auth failures on one provider fall back to the other if its key exists.
const SWITCHABLE = /credit balance|billing|quota|RESOURCE_EXHAUSTED|rate.?limit|overloaded|high demand|UNAVAILABLE|API (401|403|429|500|503|529)|invalid x-api-key|authentication|PERMISSION_DENIED|UNAUTHENTICATED/i;
function friendly(msg: string, who: string) {
  return friendlyCore(msg, who) + ` [${msg.replace(/\s+/g, " ").slice(0, 220)}]`;
}
function friendlyCore(msg: string, who: string) {
  if (who === "Claude" && /credit balance|billing/i.test(msg)) return `${who}: the account has no credit. Add OPENROUTER_API_KEY in Vercel to use OpenRouter instead.`;
  if (who === "OpenRouter" && /402|credit|insufficient/i.test(msg)) return `${who}: the key is out of credit. Top up at openrouter.ai/settings/credits.`;
  if (/401|403|invalid x-api-key|authentication|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) return `${who}: the API key was rejected. Check it in Vercel > Settings > Environment Variables.`;
  if (/quota|RESOURCE_EXHAUSTED|429|rate.?limit/i.test(msg)) return `${who}: quota or rate limit reached. Wait a minute or raise the limit.`;
  return `${who} failed.`;
}
export async function claude(opts: Opts): Promise<ClaudeResult> {
  opts = { ...opts, deadline: opts.deadline || Date.now() + HARD_MS };
  const first = provider();
  const run = (p: string) => p === "gemini" ? gemini(opts) : p === "openrouter" ? openrouter(opts) : anthropic(opts);
  const label = (p: string) => p === "gemini" ? "Gemini" : p === "openrouter" ? "OpenRouter" : "Claude";
  try {
    return await run(first);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // pick a fallback with a key
    const candidates = ["openrouter", "anthropic", "gemini"].filter(p => p !== first);
    const keys: Record<string, string | undefined> = { openrouter: orConfig().key, anthropic: process.env.ANTHROPIC_API_KEY, gemini: process.env.GEMINI_API_KEY };
    // OpenRouter is the single provider when its key is set: no fallback to other accounts.
    const other = first === "openrouter" ? undefined : candidates.find(p => keys[p]);
    if (other && SWITCHABLE.test(msg) && left(opts) > 60000) {
      try { return await run(other); }
      catch (e2: any) { throw new Error(`${friendly(msg, label(first))} Fallback also failed. ${friendly(String(e2?.message || e2), label(other))}`); }
    }
    throw new Error(friendly(msg, label(first)));
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
  const seen = new Set<string>();
  const started = Date.now();
  for (let turn = 0; turn < 8; turn++) {
    const body: any = { ...body0, model: model("anthropic"), max_tokens: opts.maxTokens || 8000, system: opts.system, messages };
    if (tools.length) body.tools = tools;
    let res: Response;
    try { res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body), signal: sig(opts) }); }
    catch (e: any) { throw new Error(/abort|timeout/i.test(String(e?.name) + e?.message) ? "The research took too long and was stopped before Vercel's 300 s limit. Try again, or ask for fewer companies." : String(e?.message || e)); }
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    for (const b of last.content || []) {
      if (b.type === "mcp_tool_use" || b.type === "server_tool_use") toolCalls.push({ name: b.name, input: b.input });
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) { addSource(sources, r.url, r.title); if (r.url) seen.add(r.url); }
      if (b.type === "mcp_tool_result") for (const u of JSON.stringify(b.content || "").match(/https?:\/\/[^\s"'<>)\]\\,]+/g) || []) seen.add(u.replace(/[.;:]+$/, ""));
      if (b.type === "text") {
        texts.push(b.text);
        for (const c of b.citations || []) addSource(sources, c.url, c.title);
      }
    }
    if (last.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: last.content });
      if (tools.length && toolTimeUp(opts, started)) {
        messages.push({ role: "user", content: "Time is up. Do not use any more tools. Give your final answer now in the requested format, marking anything missing as unknown." });
        delete body0.mcp_servers; tools.length = 0;
        delete headers["anthropic-beta"];
      }
      continue;
    }
    break;
  }
  // The final answer is the text of the last response (earlier turns may hold partial narration).
  const finalText = (last?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { text: finalText || texts.join("\n"), toolCalls, sources, usage: last?.usage, stop: last?.stop_reason, seen: [...seen] };
}

// ---------------- OpenRouter ----------------
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

async function openrouter(opts: Opts): Promise<ClaudeResult> {
  const cfg = orConfig();
  const key = cfg.key;
  if (!key) throw new Error("No model key: set KIMI_K3 or OPENROUTER_API_KEY in Vercel.");
  let mcp: McpClient | null = null;
  const nameMap = new Map<string, string>();
  const toolDefs: any[] = [];
  if (opts.crustdata && hasCrustdata()) {
    mcp = new McpClient(CRUSTDATA_MCP, process.env.CRUSTDATA_API_KEY as string);
    await withTimeout(mcp.init(), 20000, "Crustdata connect");
    const decls = (await withTimeout(mcp.tools(), 20000, "Crustdata tool list")).slice(0, 60);
    for (const t of decls) {
      const n = t.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 63);
      nameMap.set(n, t.name);
      toolDefs.push({ type: "function", function: { name: n, description: (t.description || "").slice(0, 800), parameters: t.inputSchema || { type: "object", properties: {} } } });
    }
  }
  const messages: any[] = [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }];
  const toolCalls: { name: string; input: any }[] = [];
  const sources: Source[] = [];
  let last: any = null;
  let text = "";
  const started = Date.now();
  const seen = new Set<string>();
  let wrapped = false;
  for (let turn = 0; turn < 12; turn++) {
    if (left(opts) < 8000) throw new Error("The research took too long. Try again or ask for fewer companies.");
    if (!wrapped && toolDefs.length && toolTimeUp(opts, started)) {
      wrapped = true;
      messages.push({ role: "user", content: "Time is up. Do not call any more tools. Give your final answer now in the requested format." });
    }
    const body: any = { model: model("openrouter"), messages, max_tokens: opts.maxTokens || 8000 };
    // Keep the tool list once tools were used (some models reject tool messages without it); block new calls when wrapping up.
    if (toolDefs.length) { body.tools = toolDefs; if (wrapped) body.tool_choice = "none"; }
    // Live web search (OpenRouter web plugin) on the first turn, so research cites real pages.
    if (opts.web && turn === 0 && cfg.openrouter) body.plugins = [{ id: "web", max_results: Math.min(opts.web, 8) }];
    let res: Response;
    try {
      res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://sponsordesk-blue.vercel.app", "X-Title": "SponsorDesk" },
        body: JSON.stringify(body),
        signal: sig(opts),
      });
    } catch (e: any) {
      throw new Error(/abort|timeout/i.test(String(e?.name) + e?.message) ? "The research took too long. Try again or ask for fewer companies." : String(e?.message || e));
    }
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    last = await res.json();
    const msg = last.choices?.[0]?.message;
    text = msg?.content || "";
    for (const a of msg?.annotations || []) if (a?.type === "url_citation") { addSource(sources, a.url_citation?.url, a.url_citation?.title); seen.add(a.url_citation?.url); }
    const calls = msg?.tool_calls || [];
    if (!calls.length || !mcp || wrapped) break;
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: calls });
    for (const tc of calls) {
      const fn = tc.function;
      const real = nameMap.get(fn.name) || fn.name;
      let args: any = {};
      try { args = JSON.parse(fn.arguments || "{}"); } catch { /* ignore */ }
      toolCalls.push({ name: real, input: args });
      let result: string;
      try { result = await withTimeout(mcp.call(real, args), Math.min(TOOL_CALL_MS, left(opts) - ANSWER_MS + 20000), "Crustdata call"); } catch (e: any) { result = "ERROR: " + e.message; }
      for (const u of result.match(/https?:\/\/[^\s"'<>)\]\\,]+/g) || []) seen.add(u.replace(/[.;:]+$/, ""));
      messages.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 9000) });
    }
    if (turn === 7 && !wrapped) { wrapped = true; messages.push({ role: "user", content: "Stop calling tools now and give your final answer in the requested format." }); }
  }
  harvestUrls(sources, text, 12);
  return { text, toolCalls, sources, usage: last?.usage, stop: last?.choices?.[0]?.finish_reason || "", seen: [...seen] };
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
    await withTimeout(mcp.init(), 20000, "Crustdata connect");
    const decls = (await withTimeout(mcp.tools(), 20000, "Crustdata tool list")).slice(0, 120).map((t) => {
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
  const gModels = [...new Set([model("gemini"), "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])];
  let gm = 0;
  const started = Date.now();
  let wrapped = false;
  let lowThink = true;
  for (let turn = 0; turn < 14; turn++) {
    if (left(opts) < 8000) throw new Error("The research took too long and was stopped before Vercel's 300 s limit. Try again, or ask for fewer companies.");
    if (!wrapped && tools && toolTimeUp(opts, started)) {
      wrapped = true;
      tools = undefined;
      contents.push({ role: "user", parts: [{ text: "Time is up. Do not call any more tools. Give your final answer now in the requested format, using what you have found; mark anything missing as unknown." }] });
    }
    const body: any = { systemInstruction: { parts: [{ text: opts.system }] }, contents, generationConfig: { maxOutputTokens: Math.max(opts.maxTokens || 8000, 2048) } };
    if (tools) body.tools = tools;
    if (wrapped && !tools && lowThink) body.generationConfig.thinkingConfig = { thinkingLevel: "low" }; // answer fast once research is over
    let res: Response | null = null;
    let errText = "";
    outer: for (let mi = gm; mi < gModels.length; mi++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { res = await fetch(`${GEMINI}/${gModels[mi]}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: sig(opts) }); }
        catch (e: any) { throw new Error(/abort|timeout/i.test(String(e?.name) + e?.message) ? "The research took too long and was stopped before Vercel's 300 s limit. Try again, or ask for fewer companies." : String(e?.message || e)); }
        if (res.ok) { gm = mi; break outer; }
        errText = (await res.text()).slice(0, 500);
        if (res.status === 400 && /thinking/i.test(errText) && body.generationConfig.thinkingConfig) { lowThink = false; delete body.generationConfig.thinkingConfig; attempt--; continue; }
        if ([500, 503].includes(res.status) && attempt === 0 && left(opts) > ANSWER_MS) { await new Promise((r) => setTimeout(r, 2500)); continue; } // busy: retry once
        break;
      }
      if (![404, 429, 500, 503].includes(res!.status)) break; // quota, busy or unknown model: try a lighter model
    }
    if ((!res || !res.ok) && tools && tools[0]?.google_search && res?.status === 429) {
      // Search grounding has its own (often zero) free quota: answer without it rather than fail.
      tools = undefined;
      turn--;
      continue;
    }
    if (!res || !res.ok) throw new Error(`Gemini API ${res?.status}: ${errText}`);
    last = await res.json();
    const cand = last.candidates?.[0];
    for (const ch of cand?.groundingMetadata?.groundingChunks || []) addSource(sources, ch.web?.uri, ch.web?.title);
    for (const q of cand?.groundingMetadata?.webSearchQueries || []) toolCalls.push({ name: "google_search", input: { query: q } });
    const parts: any[] = cand?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (!calls.length || !mcp || wrapped && !tools) break;
    contents.push(cand.content);
    const responses: any[] = [];
    for (const p of calls) {
      const real = nameMap.get(p.functionCall.name) || p.functionCall.name;
      toolCalls.push({ name: real, input: p.functionCall.args });
      let result: string;
      try { result = await withTimeout(mcp.call(real, p.functionCall.args || {}), Math.min(TOOL_CALL_MS, left(opts) - ANSWER_MS + 20000), "Crustdata call"); } catch (e: any) { result = "ERROR: " + e.message; }
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result: result.slice(0, 9000) } } });
    }
    contents.push({ role: "user", parts: responses });
    if (turn === 7 && !wrapped) { wrapped = true; contents.push({ role: "user", parts: [{ text: "Stop calling tools now and give your final answer in the requested format." }] }); }
  }
  harvestUrls(sources, text, 12);
  return { text, toolCalls, sources, usage: last?.usageMetadata, stop: last?.candidates?.[0]?.finishReason || "" };
}

/** Collect source links from tool output or the answer, when the provider gives no citation metadata. */
function harvestUrls(sources: Source[], text: string, max: number) {
  const seen = (text || "").match(/https?:\/\/[^\s"'<>)\]\\,]+/g) || [];
  let n = 0;
  for (const raw of seen) {
    const u = raw.replace(/[.;:]+$/, "");
    if (/crustdata|googleapis|gstatic|amazonaws|cloudfront|hubspot|\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(u)) continue;
    if (sources.some((x) => x.url === u)) continue;
    addSource(sources, u, "");
    if (++n >= max || sources.length >= 20) break;
  }
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
  const deadline = opts.deadline || Date.now() + HARD_MS;
  const raw = await claude({ ...opts, deadline });
  let data = extractJson<T>(raw.text);
  if (!data && raw.text.trim() && Date.now() < deadline + 25000) {
    const fix = await claude({ deadline: deadline + 50000, system: "You convert text to valid JSON. Output only the JSON object inside <json></json> tags.", prompt: `Convert this answer into the JSON the task asked for. Keep every fact and URL, invent nothing.\n\n${raw.text.slice(0, 20000)}`, maxTokens: 6000 });
    data = extractJson<T>(fix.text);
  }
  if (!data) throw new Error("The model did not return valid JSON. First 300 chars: " + raw.text.slice(0, 300));
  return { data, raw };
}
