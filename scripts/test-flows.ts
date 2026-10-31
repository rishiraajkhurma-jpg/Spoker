// End-to-end: every agent A0-A7 through the real flows, Claude mocked (incl. web search results), node:sqlite for Postgres.
import { setDB, db, setSetting } from "../lib/db";
import * as F from "../lib/flows";
import * as L from "../lib/ledger";
import { setMxResolver } from "../lib/contacts";
setMxResolver(async (d: string) => [{ exchange: "mx." + d }]);
const { DatabaseSync } = require("node:sqlite");
const sq = new DatabaseSync(":memory:");
setDB({ q: async (text: string, params: any[] = []) => { const t = text.replace(/\$(\d+)/g, "?$1"); const st = sq.prepare(t); const ps = params.map((p) => (p === undefined ? null : p)); if (/^\s*(SELECT|WITH)/i.test(t) || /RETURNING/i.test(t)) return st.all(...ps); st.run(...ps); return []; } });
process.env.ANTHROPIC_API_KEY = "test"; delete process.env.CRUSTDATA_API_KEY; delete process.env.GEMINI_API_KEY;
let webUsed = 0;
const reply = (obj: any, web = false) => ({ ok: true, json: async () => ({ stop_reason: "end_turn", content: [
  ...(web ? [{ type: "server_tool_use", name: "web_search", input: { query: "q" } }, { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.com/news", title: "News" }] }] : []),
  { type: "text", text: "<json>" + JSON.stringify(obj) + "</json>" }] }) });
let failDeckMou = false;
(globalThis as any).fetch = async (_url: string, init: any) => {
  if (!init?.body) return { ok: false, status: 0 }; // source checks: no network in tests
  const b = JSON.parse(init.body); const sys = b.system as string;
  if (sys.includes("SponsorDesk A0") && String(b.messages?.[0]?.content).includes("Mystery Fest")) return reply({ status: "clarify", questions: ["Which institute runs Mystery Fest?"], found: "Two fests share this name." }, true);
  if (failDeckMou && (sys.includes("SponsorDesk A4") || sys.includes("SponsorDesk A6"))) return { ok: false, status: 402, text: async () => "credit" };
  const web = (b.tools || []).some((t: any) => t.type?.startsWith("web_search"));
  if (web) webUsed++;
  if (sys.includes("SponsorDesk A0")) return reply({ name: "E-Summit 2027", organizer: "E-Cell, IIT Bombay", dates: "Jan 2027", city: "Mumbai", audience: "20,000 footfall (ecell.in)", tiers: [{ name: "Title", price_inr: 1500000, deliverables: "naming" }, { name: "Gold", price_inr: 400000, deliverables: "booth" }], floor_inr: 200000, postal_address: "IIT Bombay, Powai, Mumbai 400076" }, true);
  if (sys.includes("SponsorDesk A1, the prospecting")) return reply({ companies: [{ name: "Acme Fintech", domain: "acme.in", segment: "brand", why_now: "Series B", signals: [{ claim: "Series B", source: "https://example.com/news", date: "2026-09-10" }] }] }, true);
  if (sys.includes("SponsorDesk A1+A2")) return reply({ decision: "keep", signals: [{ claim: "Headcount +30%", source: "https://example.com/h", date: "2026-10-01" }], our_pov: { score: 78, factors: [] }, their_pov: { score: 74, factors: [] }, model: "activation", tier: "Gold", price_range: "INR 3 to 4 lakh", angle: "Fresh Series B", audience_benefit: "trading workshop", role_map: { champion: "Brand lead" },
    company_size: 400,
    contacts: [{ kind: "primary", full_name: "Priya Shah", designation: "Head of Brand", department: "Marketing", email: "", phone: "", responsibility: "Ran Acme's 2025 campus sponsorships (https://example.com/p)", evidence: [{ claim: "Led campus programme", url: "https://example.com/p", date: "2026-08-01" }], evidence_date: "2026-08-01", reason: "Owns brand budget", one_liner: "Runs brand at Acme" },
      { kind: "alternative", full_name: "Ravi Rao", designation: "CEO", department: "Leadership" },
      { kind: "fallback", full_name: "Partnerships team", designation: "Partnerships desk", email: "partnerships@acme.in", phone: "+91 22 4000 1234", phone_type: "switchboard" }],
    email: { subject: "Acme investor challenge at E-Summit", body: "Hi Priya,\n\nA proposal: an Acme Investor Challenge for 3,000 students at E-Summit, INR 3 to 4 lakh, measured on sign-ups with your referral code.\n\nReply 'send' for the one-page plan.\n\nIf this is not relevant, reply 'no' and I will not follow up." },
  }, true);
  if (sys.includes("classify one inbound")) return reply({ label: "interested", summary: "Interested, can pay 1 lakh", offer_inr: 100000 });
  if (sys.includes("A5, negotiating")) return reply({ recommendation: "Lower tier without reel", subject: "Re: Acme", body: "Hi Priya,\n\nOption A: the challenge without the reel at INR 2 lakh.\n\nWould that work by Friday?" });
  if (sys.includes("SponsorDesk A3")) return reply({ subject: "Re: Acme", body: "Hi Priya,\n\nWould one of these work?\n- Tue 11:00 IST\n- Wed 15:30 IST" });
  if (sys.includes("SponsorDesk A4")) return reply({ title: "Acme x E-Summit", thesis: "t", slides: [{ kind: "cover", heading: "Acme x E-Summit", body: ["x"], notes: "secret notes" }], talk_track: { opening: "o", discovery: ["q"], pitch: "p", objections: [], close: "c" }, one_pager: { headline: "h", bullets: ["b"], ask: "a" } });
  if (sys.includes("SponsorDesk A5. You turn")) return reply({ summary: "Good call", temperature: "warm", promises_by_us: [{ item: "revised deck", due: "Fri" }], exceptions: ["asked for fintech exclusivity"], offer_inr: null, recap: { subject: "Re: Acme", body: "Hi Priya,\n\nThanks for the time today. Next steps: revised deck by Friday." } });
  if (sys.includes("SponsorDesk A6")) return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Draft for review.\n# MOU — Acme\n1. Parties" }] }) };
  if (sys.includes("SponsorDesk A7")) return reply({ subject: "E-Summit update for Acme: 12,400 registrations", body: "Hi Priya,\n\nRegistrations crossed 12,400." });
  if (sys.includes("draft replies to sponsors")) return reply({ subject: "Re: Acme", body: "Hi Priya,\n\nHere is the plan." });
  throw new Error("unexpected call: " + sys.slice(0, 60));
};
let fails = 0; const eq = (n: string, g: any, w: any) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`); };
(async () => {
  const d = await db();
  // A0: an unclear event asks the manager and saves nothing
  const cl: any = await F.runBrief("Mystery Fest", { name: "Rishiraaj" });
  eq("A0 asks when the event is unclear", [!!cl.clarify, cl.clarify?.questions?.length, (await d.q(`SELECT COUNT(*) AS n FROM events`))[0].n], [true, 1, 0]);
  const b: any = await F.runBrief("E-Summit 2027 IIT Bombay", { name: "Rishiraaj" });
  eq("A0 never writes unknown", [/unknown/i.test(b.profile.audience), /unknown/i.test(b.profile.past_sponsors), /unknown/i.test(b.profile.proof)], [false, false, false]);
  eq("A0 brief researched with sources", [b.profile.name, (b.profile.sources || []).length > 0], ["E-Summit 2027", true]);
  await setSetting("approvers", "Rishiraaj"); // stands in for a signed-in approver in ledger-level calls
  let blocked = ""; try { await F.runDiscover(5); } catch (e: any) { blocked = e.message; }
  eq("A1 refuses before floor is locked", blocked.startsWith("Lock the floor"), true);
  await F.lockFloor(200000, "Rishiraaj");
  // A1
  eq("A1 discover via web search", (await F.runDiscover(5)).added, ["acme-in"]);
  // A1+A2 without a verified email -> exception, not ready for outreach
  const an = await F.runAnalyze("acme-in");
  eq("A1 scored P1, contact found", [an.priority, an.contact], ["P1", true]);
  const ct = (await d.q(`SELECT * FROM contacts WHERE company_id='acme-in' AND is_primary=1`))[0];
  eq("A2 primary is the brand head, not the CEO", ct.full_name, "Priya Shah");
  eq("A2 relevance scored with breakdown", [ct.relevance > 50, JSON.parse(ct.relevance_parts).length], [true, 5]);
  eq("A2 not ready for outreach without an email", await L.stageOf("acme-in"), "QUALIFIED");
  eq("A2 no-email exception", (await d.q(`SELECT COUNT(*) AS n FROM exceptions WHERE kind='no_email'`))[0].n, 1);
  eq("A2 alternative and fallback stored", (await d.q(`SELECT COUNT(*) AS n FROM contacts WHERE company_id='acme-in' AND is_primary=0`))[0].n, 2);
  const fb = (await d.q(`SELECT * FROM contacts WHERE company_id='acme-in' AND kind='fallback'`))[0];
  eq("A2 switchboard labelled, E.164", [fb.phone, fb.phone_type], ["+912240001234", "switchboard"]);
  eq("no LinkedIn columns left", Object.keys(ct).some((k) => /linkedin/.test(k)), false);
  // Manager adds email -> priced offer queued, lint passes with postal
  const se = await F.setContactEmail(ct.id, "priya@acme.in");
  eq("A2 offer queued after email added", (se.queued as any).ok, true);
  const m0 = (await d.q(`SELECT * FROM messages WHERE sequence='cold'`))[0];
  eq("Email agent: signature + postal", m0.body.includes("400076") && m0.body.includes("Best regards"), true);
  eq("approve offer", (await L.approve(m0.key, "Rishiraaj")).ok, true);
  // Reply below floor -> exception with counter
  const r: any = await F.simulateReply("acme-in", "We can do 1 lakh only", "https://x.app");
  eq("A2 reply classified, stage REPLIED", [r.label, await L.stageOf("acme-in")], ["interested", "REPLIED"]);
  eq("A5 below-floor counter raised", (await d.q(`SELECT COUNT(*) AS n FROM exceptions WHERE kind='below_floor'`))[0].n, 1);
  // A3
  const sch: any = await F.scheduleMeeting("acme-in", "first_call", ["Tue 11:00 IST", "Wed 15:30 IST"]);
  eq("A3 scheduling email drafted", [sch.ok, await L.stageOf("acme-in")], [true, "MEETING_REQUESTED"]);
  const cm = await F.confirmMeeting("acme-in", "2026-11-05T11:00", 30, "Rishiraaj", "", true);
  eq("A3 same slot twice books once", ((await F.confirmMeeting("acme-in", "2026-11-05T11:00", 30, "Rishiraaj", "", true)) as any).duplicate, true);
  eq("A3 meeting confirmed (no Google: recorded)", [cm.ok, await L.stageOf("acme-in")], [true, "MEETING_SCHEDULED"]);
  // A4
  const dk = await F.buildDeck("acme-in");
  eq("A4 deck stored", (await d.q(`SELECT COUNT(*) AS n FROM decks`))[0].n >= 1 && !!dk.id, true);
  // A5
  const g = await F.ingestNotes("acme-in", "Priya: we like the challenge. Asked for fintech exclusivity.");
  eq("A5 digest + recap drafted", [g.temperature, (await d.q(`SELECT COUNT(*) AS n FROM messages WHERE sequence='recap'`))[0].n, await L.stageOf("acme-in")], ["warm", 1, "NEGOTIATING"]);
  eq("A5 exclusivity raised as exception", (await d.q(`SELECT COUNT(*) AS n FROM exceptions WHERE kind='meeting_exception'`))[0].n, 1);
  // A6
  const mu = await F.makeMou("acme-in", { tier: "Gold", cash_inr: 400000, deliverables: "booth" });
  eq("A6 MOU drafted, no em dash, shareable", [mu.mou.includes("—"), !!mu.share, await L.stageOf("acme-in")], [false, true, "MOU_DRAFTED"]);
  eq("A6 MOU email drafted", (await F.sendMou("acme-in", "https://x.app")).ok, true);
  await L.setStage("acme-in", "MOU_SIGNED", "signed", "manager");
  // A7
  // A4/A6 fall back to the organiser's PDFs when the agent cannot produce them
  failDeckMou = true;
  const dk2 = await F.buildDeck("acme-in");
  const dj = JSON.parse((await d.q(`SELECT json FROM decks WHERE id=$1`, [dk2.id]))[0].json);
  eq("A4 falls back to the standard deck PDF", dj.fallback_pdf, "/fallback/sponsorship-deck.pdf");
  const mu2 = await F.makeMou("acme-in", { tier: "Gold", cash_inr: 400000, deliverables: "booth" });
  eq("A6 falls back to the standard MOU PDF", [(await d.q(`SELECT mou_pdf FROM deals WHERE company_id='acme-in'`))[0].mou_pdf, !!mu2.share], ["/fallback/mou.pdf", true]);
  eq("fallbacks raise no exception", (await d.q(`SELECT COUNT(*) AS n FROM exceptions WHERE kind LIKE '%deck%' OR kind LIKE '%mou%'`))[0].n, 0);
  failDeckMou = false;
  await L.setStage("acme-in", "MOU_SIGNED", "signed", "manager");
  eq("A7 update drafted for signed sponsor", (await F.nurture("Registrations crossed 12,400")).drafted, 1);
  eq("web search used for research agents", webUsed >= 3, true);
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
