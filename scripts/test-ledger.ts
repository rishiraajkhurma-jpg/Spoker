// Regression tests for the ledger (every council bug). Compile with tsc to CommonJS, then run with node 22+.
// node:sqlite stands in for Postgres; $n placeholders are rewritten to ?n.
import { setDB, db, setSetting, nowIso } from "../lib/db";
import * as L from "../lib/ledger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite");
const sq = new DatabaseSync(":memory:");
setDB({
  q: async (text: string, params: any[] = []) => {
    const t = text.replace(/\$(\d+)/g, "?$1");
    const st = sq.prepare(t);
    const ps = params.map((p) => (p === undefined ? null : p));
    if (/^\s*(SELECT|WITH)/i.test(t) || /RETURNING/i.test(t)) return st.all(...ps) as any[];
    st.run(...ps);
    return [];
  },
});

let fails = 0;
function eq(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const SIG = "\n\nBest regards,\nAarav\nMarketing Manager, E-Summit\nE-Cell, IIT Bombay, Powai, Mumbai 400076";
const B0 = "Hi Priya,\n\nA proposal: an Acme hiring challenge for 3,000 final-year students at E-Summit, from INR 3 to 5 lakh, measured on applications through your careers link.\n\nReply 'send' for the one-page plan.\n\nIf this is not relevant, reply 'no' and I will not follow up." + SIG;
const B1 = "Hi Priya,\n\nOne more option: a smaller workshop slot, measured on sign-ups.\n\nIf this is not relevant, reply 'no' and I will not follow up." + SIG;

(async () => {
  const d = await db();
  await setSetting("postal", "400076");
  await setSetting("approvers", "Rishiraaj");
  await setSetting("spacing_sec", "0");
  for (const [id, stage] of [["acme", "QUALIFIED"], ["beta", "NEGOTIATING"]])
    await d.q(`INSERT INTO companies (id, name, stage, updated_at) VALUES ($1,$2,$3,$4)`, [id, id, stage, nowIso()]);
  for (const [id, co, em] of [["c1", "acme", "priya@acme.com"], ["c2", "acme", "ravi@acme.com"], ["c9", "beta", "x@beta.com"]])
    await d.q(`INSERT INTO contacts (id, company_id, email, full_name, status, is_primary, created_at) VALUES ($1,$2,$3,$4,'active',1,$5)`, [id, co, em, id, nowIso()]);

  const bad = await L.queue({ key: "c1:cold:0", contact_id: "c1", company_id: "acme", sequence: "cold", step: 0, subject: "Acme hiring challenge", body: "Hi {{first_name}},\n\nOffer.\n\nBest regards,\nA" });
  eq("lint blocks placeholder + postal", [bad.reason, (bad.problems || []).length >= 2], ["lint", true]);
  eq("queue ok", (await L.queue({ key: "c1:cold:0", contact_id: "c1", company_id: "acme", sequence: "cold", step: 0, subject: "Acme hiring challenge", body: B0, scheduled_for: "2026-01-01T10:00" })).ok, true);
  eq("one thread per company", (await L.queue({ key: "c2:cold:0", contact_id: "c2", company_id: "acme", sequence: "cold", step: 0, subject: "Acme hiring", body: B0 })).reason, "one_live_thread_per_company");
  eq("max 3 cold emails", (await L.queue({ key: "c1:cold:3", contact_id: "c1", company_id: "acme", sequence: "cold", step: 3, subject: "x y", body: B1 })).reason, "cold_step_max_2");
  eq("agent cannot approve step 0", (await L.approve("c1:cold:0", "agent")).reason, "needs_human_approver");
  eq("unknown approver refused", (await L.approve("c1:cold:0", "Mallory")).reason, "unknown_approver");
  eq("manager approves", (await L.approve("c1:cold:0", "Rishiraaj")).ok, true);
  eq("claim", await L.claim("c1:cold:0"), "CLAIMED");
  eq("second claim refused", await L.claim("c1:cold:0"), "ALREADY");
  const s = await L.markSent("c1:cold:0", "T1", "G1");
  eq("sent asks for next step", s.next?.key, "c1:cold:1");
  eq("stage CONTACTED", await L.stageOf("acme"), "CONTACTED");
  eq("reconcile finds missing step", (await L.reconcileLists()).missing.map((m) => m.next_key), ["c1:cold:1"]);
  await L.queue({ key: "c1:cold:1", contact_id: "c1", company_id: "acme", sequence: "cold", step: 1, subject: "Re: Acme hiring challenge", body: B1, scheduled_for: "2026-01-02T10:00" });
  eq("auto approve follow-up", (await L.approve("c1:cold:1", "auto")).ok, true);
  eq("auto_reply keeps sequence", await L.recordReply({ gmail_id: "g1", contact_id: "c1", company_id: "acme", classification: "auto_reply", summary: "OOO", resume_after: "2030-01-10" }), "AUTO_REPLY");
  eq("follow-up pushed past return", (await L.due(new Date("2030-02-01T00:00:00Z"))).map((m: any) => m.key), ["c1:cold:1"]);
  eq("not due before return", (await L.due(new Date("2029-12-01T00:00:00Z"))).length, 0);
  eq("reply on live deal keeps stage", await L.recordReply({ gmail_id: "g2", contact_id: "c9", company_id: "beta", classification: "not_interested", summary: "cc says no" }), "KEPT_STAGE");
  eq("beta still NEGOTIATING", await L.stageOf("beta"), "NEGOTIATING");
  eq("human reply moves pre-reply company", await L.recordReply({ gmail_id: "g3", contact_id: "c1", company_id: "acme", classification: "interested", summary: "send deck" }), "MOVED");
  eq("duplicate reply ignored", await L.recordReply({ gmail_id: "g3", contact_id: "c1", company_id: "acme", classification: "interested", summary: "x" }), "DUPLICATE");
  eq("cold follow-up cancelled", (await d.q(`SELECT status FROM messages WHERE key='c1:cold:1'`))[0].status, "cancelled");
  const R = "Hi Priya,\n\nAttaching the deck." + SIG;
  await L.queue({ key: "c1:reply:1", contact_id: "c1", company_id: "acme", sequence: "reply", step: 1, subject: "Deck", body: R });
  eq("reply needs human", (await L.approve("c1:reply:1", "auto")).reason, "needs_human_approver");
  await L.approve("c1:reply:1", "Rishiraaj");
  eq("approved reply comes due on REPLIED company", (await L.due()).map((m: any) => m.key), ["c1:reply:1"]);
  eq("no new cold after reply", (await L.queue({ key: "c1:cold:2", contact_id: "c1", company_id: "acme", sequence: "cold", step: 2, subject: "Re: x", body: B1 })).reason, "company_already_replied");
  await setSetting("cap_total_per_day", "1");
  eq("daily cap", await L.claim("c1:reply:1"), "CAP:total_per_day");
  await setSetting("cap_total_per_day", "60");
  eq("claim after cap raised", await L.claim("c1:reply:1"), "CLAIMED");
  await L.markFailed("c1:reply:1");
  eq("retry after failure", await L.retry("c1:reply:1"), "RETRY_APPROVED");
  eq("opt-out", await L.recordReply({ gmail_id: "g4", contact_id: "c2", company_id: "acme", classification: "opt_out", summary: "remove" }), "OPT_OUT");
  eq("suppressed cannot be queued", (await L.queue({ key: "c2:reply:0", contact_id: "c2", company_id: "acme", sequence: "reply", step: 0, subject: "Deck", body: R })).reason, "suppressed");
  eq("forget erases", await L.forget("priya@acme.com"), 1);
  eq("IST parsing", L.parseTime("2026-01-01T10:00").toISOString(), "2026-01-01T04:30:00.000Z");
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
