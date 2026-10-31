// Email engine failure tests: concurrency, caps, spacing, ambiguous delivery, DB failure after send, opt-out during send.
// node:sqlite stands in for Postgres (single process: it proves the logic, not Postgres locking). Gmail is mocked at fetch.
import { setDB, db, setSetting, nowIso } from "../lib/db";
import * as L from "../lib/ledger";
import * as F from "../lib/flows";
const { DatabaseSync } = require("node:sqlite");
const sq = new DatabaseSync(":memory:");
let failNextMarkSent = false;
setDB({
  q: async (text: string, params: any[] = []) => {
    if (failNextMarkSent && /SET status='sent'/.test(text)) { failNextMarkSent = false; throw new Error("connection reset"); }
    await new Promise((r) => setTimeout(r, 0)); // let concurrent callers interleave between statements
    const t = text.replace(/\$(\d+)/g, "?$1"); const st = sq.prepare(t); const ps = params.map((p) => (p === undefined ? null : p));
    if (/^\s*(SELECT|WITH)/i.test(t) || /RETURNING/i.test(t)) return st.all(...ps); st.run(...ps); return [];
  },
});
process.env.GOOGLE_CLIENT_ID = "x"; process.env.GOOGLE_CLIENT_SECRET = "y";
let gmailMode: "ok" | "timeout" | "reject" | "5xx" = "ok"; let sends = 0; let sentFolder: any[] = [];
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = String(url);
  const J = (status: number, j: any) => ({ ok: status < 400, status, json: async () => j, text: async () => JSON.stringify(j) });
  if (u.includes("oauth2.googleapis.com/token")) return J(200, { access_token: "t", expires_in: 3600 });
  if (u.endsWith("/messages/send")) {
    if (gmailMode === "timeout") { sends++; throw new TypeError("fetch failed: socket timeout"); } // may have been delivered
    if (gmailMode === "reject") return J(400, { error: "invalidArgument" });
    if (gmailMode === "5xx") { sends++; return J(503, { error: "backend" }); }
    sends++; const id = "G" + sends; sentFolder.push({ id, body: JSON.parse(init.body).raw }); return J(200, { id, threadId: "T" + sends });
  }
  if (u.includes("/messages/G")) return J(200, { id: u.split("/messages/")[1].split("?")[0], threadId: "T", payload: { headers: [] } });
  if (u.includes("/messages?q=")) return J(200, { messages: [] }); // Sent search finds nothing (indexing delay)
  if (u.includes("/threads/")) return J(200, { messages: [] });
  throw new Error("unexpected fetch " + u);
};
let fails = 0; const eq = (n: string, g: any, w: any) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`); };
const SIG = "\n\nBest regards,\nAarav\nE-Cell, IIT Bombay, Powai, Mumbai 400076";
const body = (i: number) => `Hi Priya,\n\nThanks for the call ${i}. Notes attached as discussed.` + SIG;

(async () => {
  const d = await db();
  await setSetting("postal", "400076"); await setSetting("approvers", "Rishiraaj"); await setSetting("spacing_sec", "0");
  await setSetting("gmail_email", "me@x.in"); await setSetting("gmail_refresh", "r"); await setSetting("organiser_permission", "yes");
  await d.q(`INSERT INTO events (id, profile, updated_at) VALUES ('current', $1, $2)`, [JSON.stringify({ name: "E", sender: { name: "A" }, floor_inr: 1 }), nowIso()]);
  for (let i = 0; i < 6; i++) {
    await d.q(`INSERT INTO companies (id, name, stage, updated_at) VALUES ($1,$1,'NEGOTIATING',$2)`, ["co" + i, nowIso()]);
    await d.q(`INSERT INTO contacts (id, company_id, email, full_name, status, is_primary, created_at) VALUES ($1,$2,$3,'P','active',1,$4)`, ["c" + i, "co" + i, `p${i}@co${i}.in`, nowIso()]);
    await L.queue({ key: "k" + i, contact_id: "c" + i, company_id: "co" + i, sequence: "reply", step: 1, subject: "Notes " + i, body: body(i) });
    await L.approve("k" + i, "Rishiraaj");
  }
  // 1. Concurrent workers cannot exceed the daily cap
  await setSetting("cap_total_per_day", "2");
  const res = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => L.claim("k" + i)));
  eq("concurrent claims respect cap 2", res.filter((r) => r === "CLAIMED").length, 2);
  eq("others told the cap is reached", res.filter((r) => r === "CAP:total_per_day").length, 4);
  // 2. Same message claimed twice concurrently: only one wins, budget refunded for the loser
  await d.q(`UPDATE messages SET status='approved', claimed_at=NULL WHERE status='claimed'`); await d.q(`DELETE FROM send_budget`);
  await setSetting("cap_total_per_day", "60");
  const dup = await Promise.all([L.claim("k0"), L.claim("k0"), L.claim("k0")]);
  eq("one claim per message", dup.filter((r) => r === "CLAIMED").length, 1);
  eq("loser's budget refunded", (await d.q(`SELECT used FROM send_budget WHERE k LIKE 'total:%'`))[0].used, 1);
  await d.q(`UPDATE messages SET status='approved', claimed_at=NULL WHERE key='k0'`); await d.q(`DELETE FROM send_budget`);
  // 3. Spacing
  await setSetting("spacing_sec", "120");
  eq("first claim with spacing", await L.claim("k1"), "CLAIMED");
  eq("second waits for spacing", (await L.claim("k2")).startsWith("WAIT:"), true);
  await d.q(`UPDATE messages SET status='approved', claimed_at=NULL WHERE key='k1'`); await d.q(`DELETE FROM send_budget`); await setSetting("spacing_sec", "0");
  // 4. Gmail timeout -> send_unknown, never resent
  gmailMode = "timeout"; sends = 0;
  await d.q(`UPDATE messages SET status='cancelled' WHERE key IN ('k1','k2','k3','k4','k5')`);
  await F.sendDue(20000);
  eq("timeout marks send_unknown", (await d.q(`SELECT status FROM messages WHERE key='k0'`))[0].status, "send_unknown");
  gmailMode = "ok"; await F.sendDue(20000);
  eq("unknown is not resent by the next run", sends, 1);
  // 5. Reconcile: not in Sent yet -> wait; after 6h -> needs_manual_review + exception, still not resent
  await F.reconcile();
  eq("young unknown keeps waiting", (await d.q(`SELECT status FROM messages WHERE key='k0'`))[0].status, "send_unknown");
  await d.q(`UPDATE messages SET claimed_at=$1 WHERE key='k0'`, [new Date(Date.now() - 7 * 3600e3).toISOString()]);
  await F.reconcile();
  eq("old unknown goes to a person", (await d.q(`SELECT status FROM messages WHERE key='k0'`))[0].status, "needs_manual_review");
  eq("exception raised for delivery", (await d.q(`SELECT COUNT(*) AS n FROM exceptions WHERE kind='delivery_unknown'`))[0].n, 1);
  eq("still sent only once", sends, 1);
  eq("approver can confirm it was sent", (await L.resolveUnknown("k0", "sent", "Rishiraaj")).ok, true);
  // 6. DB fails right after Gmail accepted -> send_unknown with gmail id, reconcile confirms, no duplicate
  await d.q(`UPDATE messages SET status='approved' WHERE key='k1'`); sends = 0; failNextMarkSent = true;
  await F.sendDue(20000);
  const k1 = (await d.q(`SELECT status, gmail_id FROM messages WHERE key='k1'`))[0];
  eq("DB failure after send keeps gmail id, not failed", [k1.status, !!k1.gmail_id], ["send_unknown", true]);
  await F.reconcile();
  eq("reconcile confirms by gmail id", (await d.q(`SELECT status FROM messages WHERE key='k1'`))[0].status, "sent");
  eq("no duplicate after DB failure", sends, 1);
  // 7. Gmail 4xx rejection -> failed -> retried (safe: never accepted)
  await d.q(`UPDATE messages SET status='approved' WHERE key='k2'`); gmailMode = "reject";
  await F.sendDue(20000);
  eq("4xx is a definite failure", (await d.q(`SELECT status FROM messages WHERE key='k2'`))[0].status, "failed");
  await F.reconcile();
  eq("definite failure retried", (await d.q(`SELECT status FROM messages WHERE key='k2'`))[0].status, "approved");
  // 8. 5xx is ambiguous
  gmailMode = "5xx"; await F.sendDue(20000);
  eq("5xx treated as uncertain", (await d.q(`SELECT status FROM messages WHERE key='k2'`))[0].status, "send_unknown");
  // 9. Opt-out lands while queued: suppressed contact is not sent
  gmailMode = "ok"; sends = 0;
  await d.q(`UPDATE messages SET status='approved' WHERE key='k3'`);
  await L.suppress("p3@co3.in", "opt_out");
  await F.sendDue(20000);
  eq("opted-out contact not sent", [sends, (await d.q(`SELECT status FROM messages WHERE key='k3'`))[0].status], [0, "cancelled"]);
  eq("suppressed contact cannot be requeued", (await L.queue({ key: "k3b", contact_id: "c3", company_id: "co3", sequence: "reply", step: 1, subject: "Again", body: body(9) })).reason, "suppressed");
  // 10. Header injection refused
  await d.q(`UPDATE contacts SET email=$1 WHERE id='c4'`, ["a@b.in\r\nBcc: x@evil.com"]);
  await d.q(`UPDATE messages SET status='approved', to_email=$1 WHERE key='k4'`, ["a@b.in\r\nBcc: x@evil.com"]);
  await F.sendDue(20000);
  eq("unsafe recipient refused, nothing sent", [sends, (await d.q(`SELECT status FROM messages WHERE key='k4'`))[0].status], [0, "failed"]);
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
