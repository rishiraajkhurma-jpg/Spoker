// Connection check: one tiny call per service, so problems show up before an agent run.
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { McpClient } from "@/lib/mcp";
import { model } from "@/lib/claude";
import { connectedEmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function check(fn: () => Promise<string>) {
  const t = Date.now();
  try { return { ok: true, detail: await fn(), ms: Date.now() - t }; }
  catch (e: any) { return { ok: false, detail: String(e?.message || e).replace(/\s+/g, " ").slice(0, 300), ms: Date.now() - t }; }
}

export async function GET(req: Request) {
  const g = await guard(req); if (g) return g;
  const out: Record<string, any> = {};
  out.database = await check(async () => { const d = await db(); await d.q("SELECT 1"); return "connected"; });
  out.claude = !process.env.ANTHROPIC_API_KEY ? { ok: false, detail: "ANTHROPIC_API_KEY not set" } : await check(async () => {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: model("anthropic"), max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 200)}`);
    return `${model("anthropic")} replied`;
  });
  out.openrouter = !process.env.OPENROUTER_API_KEY ? { ok: false, detail: "OPENROUTER_API_KEY not set (optional)" } : await check(async () => {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://sponsordesk-blue.vercel.app", "X-Title": "SponsorDesk" }, body: JSON.stringify({ model: model("openrouter"), max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 200)}`);
    return `${model("openrouter")} replied`;
  });
  out.gemini = !process.env.GEMINI_API_KEY ? { ok: false, detail: "GEMINI_API_KEY not set (optional)" } : await check(async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model("gemini")}:generateContent`, { method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY as string, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply OK" }] }], generationConfig: { maxOutputTokens: 5 } }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status}: ${j?.error?.message || ""}`.slice(0, 250));
    return `${model("gemini")} replied`;
  });
  out.crustdata = !process.env.CRUSTDATA_API_KEY ? { ok: false, detail: "CRUSTDATA_API_KEY not set (web search is used instead)" } : await check(async () => {
    const m = new McpClient("https://install.crustdata.com/mcp", process.env.CRUSTDATA_API_KEY as string);
    await m.init();
    const tools = await m.tools();
    return `${tools.length} tools available: ${tools.slice(0, 6).map((t) => t.name).join(", ")}`;
  });
  out.gmail = { ok: !!(await connectedEmail()), detail: (await connectedEmail()) || "not connected (draft mode)" };
  return Response.json(out);
}
