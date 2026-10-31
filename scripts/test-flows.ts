// End-to-end flow test with Claude mocked and node:sqlite standing in for Postgres.
import { setDB, db, setSetting, nowIso } from "../lib/db";
import * as F from "../lib/flows";
import * as L from "../lib/ledger";
const { DatabaseSync } = require("node:sqlite");
const sq = new DatabaseSync(":memory:");
setDB({ q: async (text: string, params: any[] = []) => { const t = text.replace(/\$(\d+)/g, "?$1"); const st = sq.prepare(t); const ps = params.map((p) => (p === undefined ? null : p)); if (/^\s*(SELECT|WITH)/i.test(t) || /RETURNING/i.test(t)) return st.all(...ps); st.run(...ps); return []; } });
process.env.ANTHROPIC_API_KEY = "test"; process.env.CRUSTDATA_API_KEY = "test";
const reply = (obj: any) => ({ ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "mcp_tool_use", name: "search", input: {} }, { type: "text", text: "<json>" + JSON.stringify(obj) + "</json>" }] }) });
(globalThis as any).fetch = async (url: string, init: any) => {
  const b = JSON.parse(init.body); const sys = b.system as string;
  if (sys.includes("A1, the prospecting")) return reply({ companies: [{ name: "Acme Fintech", domain: "acme.in", segment: "brand", why_now: "Raised Series B Sept 2026", signals: [{ claim: "Series B", source: "crustdata", field: "funding", value: "USD 40M", date: "2026-09-10" }] }] });
  if (sys.includes("A1+A2")) return reply({ decision: "keep", signals: [{ claim: "Headcount +30%", source: "crustdata", field: "headcount_growth_6m", value: "+30%", date: "2026-10-01" }], our_pov: { score: 78, factors: [] }, their_pov: { score: 74, factors: [] }, model: "activation", tier: "Gold", price_range: "INR 3 to 4 lakh", angle: "Fresh Series B, student users", audience_benefit: "free trading workshop", role_map: { champion: "Brand lead" },
    contact: { full_name: "Priya Shah", position: "Head of Brand", email: "priya@acme.in", email_status: "verified", one_liner: "Runs brand at Acme", context: ["Posted about campus campaign, Oct 2026"] },
    email: { subject: "Acme investor challenge at E-Summit", body: "Hi Priya,\n\nA proposal: an Acme Investor Challenge for 3,000 students at E-Summit, INR 3 to 4 lakh, measured on sign-ups with your referral code.\n\nReply 'send' for the one-page plan.\n\nIf this is not relevant, reply 'no' and I will not follow up." } });
  if (sys.includes("classify one inbound")) return reply({ label: "interested", summary: "Interested but can pay 1 lakh only", offer_inr: 100000, return_date: null, suspicious: false });
  if (sys.includes("A5, negotiating")) return reply({ recommendation: "Offer Silver-level activation without reel", subject: "Re: Acme investor challenge", body: "Hi Priya,\n\nThanks for being open about budget. Option A: the challenge without the reel at INR 2 lakh. Option B: INR 1 lakh plus trading credits for winners.\n\nWould either work by Friday?" });
  if (sys.includes("A6")) return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Draft for review.\n# MOU — Acme\n1. Parties" }] }) };
  throw new Error("unexpected call: " + sys.slice(0, 60));
};
let fails = 0; const eq = (n: string, g: any, w: any) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`); };
(async () => {
  const d = await db();
  await setSetting("approvers", "Rishiraaj");
  await d.q(`INSERT INTO events (id, profile, updated_at) VALUES ('current',$1,$2)`, [JSON.stringify({ name: "E-Summit 2027", organizer: "E-Cell", dates: "Jan 2027", city: "Mumbai", audience: "8,000 (gate scans)", tiers: [{ name: "Gold", price_inr: 400000, deliverables: "booth" }], floor_inr: 200000, sender: { name: "Aarav", title: "Manager", org: "E-Cell, IIT Bombay" }, postal_address: "Powai, Mumbai 400076" }), nowIso()]);
  await setSetting("postal", "400076");
  eq("discover adds", (await F.runDiscover(5)).added, 1);
  const an = await F.runAnalyze("acme-in");
  eq("analyze P1 + queued", [an.priority, an.queued?.ok], ["P1", true]);
  const m = (await d.q(`SELECT * FROM messages`))[0];
  eq("signature + postal appended", m.body.includes("400076") && m.body.includes("Best regards"), true);
  eq("approve", (await L.approve(m.key, "Rishiraaj")).ok, true);
  eq("send without gmail = draft mode", (await F.sendDue()).sent, 0);
  const r: any = await F.simulateReply("acme-in", "We can do 1 lakh only");
  eq("classified", r.label, "interested");
  eq("stage REPLIED", await L.stageOf("acme-in"), "REPLIED");
  eq("cold cancelled by reply", (await d.q(`SELECT status FROM messages WHERE key=$1`, [m.key]))[0].status, "cancelled");
  const ex = (await d.q(`SELECT * FROM exceptions WHERE kind='below_floor'`))[0];
  eq("below-floor exception", !!ex, true);
  const res = await F.resolveException(ex.id, "approve", "Rishiraaj", "ok");
  eq("counter queued + approved", [res.ok, (await d.q(`SELECT status FROM messages WHERE key LIKE '%exception%'`))[0]?.status], [true, "approved"]);
  eq("stage NEGOTIATING", await L.stageOf("acme-in"), "NEGOTIATING");
  const md = await F.makeMou("acme-in", { tier: "Gold", cash_inr: 200000, deliverables: "booth" });
  eq("MOU has no em dash", md.includes("—"), false);
  eq("stage MOU_DRAFTED", await L.stageOf("acme-in"), "MOU_DRAFTED");
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
