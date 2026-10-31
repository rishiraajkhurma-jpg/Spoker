// Gemini + MCP loop test with both services mocked.
import { claude, provider, model } from "../lib/claude";
process.env.GEMINI_API_KEY = "k"; process.env.CRUSTDATA_API_KEY = "c"; delete process.env.SD_MODEL;
let geminiCalls = 0; const seen: string[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  const body = JSON.parse(init.body || "{}");
  if (url.includes("crustdata")) {
    seen.push(body.method);
    const hdr = new Map([["content-type", body.method === "tools/list" ? "text/event-stream" : "application/json"], ["mcp-session-id", "s1"]]);
    const h = { get: (k: string) => hdr.get(k) || null };
    const result = body.method === "initialize" ? { capabilities: {} } : body.method === "tools/list" ? { tools: [{ name: "company.search", description: "find companies", inputSchema: { $schema: "x", type: "object", properties: { q: { type: "string" } } } }] } : { content: [{ type: "text", text: "Acme: headcount +30%" }] };
    const msg = JSON.stringify({ jsonrpc: "2.0", id: body.id, result });
    return { ok: true, headers: h, text: async () => (hdr.get("content-type") === "text/event-stream" ? `event: message\ndata: ${msg}\n\n` : msg) };
  }
  geminiCalls++;
  if (!url.includes("gemini-3.8-flash:generateContent") || init.headers["x-goog-api-key"] !== "k") throw new Error("bad gemini url/header " + url);
  if (geminiCalls === 1) {
    if (body.tools[0].functionDeclarations[0].name !== "company.search" || body.tools[0].functionDeclarations[0].parametersJsonSchema.$schema) throw new Error("bad decls");
    return { ok: true, json: async () => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "company.search", args: { q: "fintech" } }, thoughtSignature: "sig" }] } }] }) };
  }
  const last = body.contents[body.contents.length - 1];
  const prevModel = body.contents[body.contents.length - 2];
  const ok = last.parts[0].functionResponse?.response?.result === "Acme: headcount +30%" && prevModel.parts[0].thoughtSignature === "sig";
  return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: ok ? "<json>{\"ok\":true}</json>" : "BAD" }] } }] }) };
};
(async () => {
  const r = await claude({ system: "s", prompt: "p", crustdata: true });
  const pass = provider() === "gemini" && model() === "gemini-3.8-flash" && r.text.includes('"ok":true') && r.toolCalls[0]?.name === "company.search" && seen.join(",") === "initialize,notifications/initialized,tools/list,tools/call";
  console.log(pass ? "GEMINI LOOP PASS" : "FAIL " + JSON.stringify({ text: r.text, seen, tc: r.toolCalls }));
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
