// The send ledger: the ONLY path to Gmail. queue -> approve -> claim -> sent. Port of pipeline_db.py.
import { db, nowIso, uid, num, getSetting } from "./db";
import { lint } from "./lint";

export const PRE_REPLY = ["PROSPECT", "QUALIFIED", "CONTACT_READY", "CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2"];
export const DEAD = ["OPTED_OUT", "BOUNCED", "LOST", "DISQUALIFIED"];
export const COLD_MAX_STEP = 2;
export const COLD_GAPS_BD: Record<number, number> = { 1: 3, 2: 5 };
const AUTO_NAMES = new Set(["", "auto", "agent", "claude", "system", "bot", "assistant"]);

const IST_MS = 330 * 60 * 1000;

export async function sha16(s: string) {
  const norm = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
export async function emailHash(e: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((e || "").trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse ISO; a time without offset is read as IST. Returns a Date. */
export function parseTime(s: string): Date {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return new Date(s);
  return new Date(new Date(s + "Z").getTime() - IST_MS);
}
export function addBusinessDays(d: Date, n: number): Date {
  let t = new Date(d.getTime());
  while (n > 0) {
    t = new Date(t.getTime() + 86400000);
    const wd = new Date(t.getTime() + IST_MS).getUTCDay();
    if (wd !== 0 && wd !== 6) n--;
  }
  return t;
}
function istDayStart(): string {
  const n = new Date(Date.now() + IST_MS);
  n.setUTCHours(0, 0, 0, 0);
  return new Date(n.getTime() - IST_MS).toISOString();
}

export async function log(actor: string, company_id: string | null, action: string, detail = "", from: string | null = null, to: string | null = null) {
  const d = await db();
  await d.q(`INSERT INTO log (id, ts, actor, company_id, action, from_stage, to_stage, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid(), nowIso(), actor, company_id, action, from, to, detail]);
}
export async function stageOf(cid: string): Promise<string | null> {
  const d = await db();
  const r = await d.q(`SELECT stage FROM companies WHERE id=$1`, [cid]);
  return r[0]?.stage ?? null;
}
export async function setStage(cid: string, stage: string, reason: string, actor = "agent") {
  const d = await db();
  const old = await stageOf(cid);
  await d.q(`UPDATE companies SET stage=$1, stage_reason=$2, updated_at=$3 WHERE id=$4`, [stage, reason, nowIso(), cid]);
  await log(actor, cid, "stage", reason, old, stage);
}
export async function isSuppressed(email?: string | null) {
  if (!email) return false;
  const d = await db();
  return (await d.q(`SELECT 1 FROM suppress WHERE email_hash=$1`, [await emailHash(email)])).length > 0;
}
export async function humanReplyExists(cid: string) {
  const d = await db();
  return (await d.q(`SELECT 1 FROM replies WHERE company_id=$1 AND classification <> 'auto_reply'`, [cid])).length > 0;
}
export async function caps() {
  return {
    newPerDay: Number(await getSetting("cap_new_per_day", "30")),
    totalPerDay: Number(await getSetting("cap_total_per_day", "60")),
    spacingSec: Number(await getSetting("spacing_sec", "60")),
  };
}

export type QueueInput = { key: string; contact_id: string; company_id: string; sequence: string; step: number; subject: string; body: string; scheduled_for?: string };

export async function queue(m: QueueInput): Promise<{ ok: boolean; reason?: string; problems?: string[]; gate?: string }> {
  const d = await db();
  if ((await d.q(`SELECT 1 FROM messages WHERE key=$1`, [m.key])).length) return { ok: false, reason: "exists" };
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [m.contact_id]))[0];
  if (!ct || !ct.email) return { ok: false, reason: "no_contact_email" };
  if (ct.company_id !== m.company_id) return { ok: false, reason: "contact_not_at_company" };
  if ((await isSuppressed(ct.email)) || ["opted_out", "bounced", "erased"].includes(ct.status)) return { ok: false, reason: "suppressed" };
  const st = await stageOf(m.company_id);
  if (!st) return { ok: false, reason: "no_company" };
  if (m.sequence === "cold") {
    if (m.step > COLD_MAX_STEP) return { ok: false, reason: `cold_step_max_${COLD_MAX_STEP}` };
    const other = await d.q(`SELECT 1 FROM messages WHERE company_id=$1 AND sequence='cold' AND contact_id<>$2 AND status IN ('drafted','approved','claimed','sent')`, [m.company_id, m.contact_id]);
    if (other.length && st !== "NO_RESPONSE") return { ok: false, reason: "one_live_thread_per_company" };
    if (await humanReplyExists(m.company_id)) return { ok: false, reason: "company_already_replied" };
  }
  const problems = lint(m.subject, m.body, m.sequence, m.step, await getSetting("postal", ""));
  if (problems.length) return { ok: false, reason: "lint", problems };
  const gate = m.sequence === "cold" && m.step >= 1 ? "auto" : "approve";
  const when = m.scheduled_for ? parseTime(m.scheduled_for).toISOString() : nowIso();
  await d.q(`INSERT INTO messages (id, key, contact_id, company_id, to_email, sequence, step, subject, body, body_hash, gate, lint_ok, status, attempts, scheduled_for, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,'drafted',0,$12,$13)`,
    [uid(), m.key, m.contact_id, m.company_id, ct.email, m.sequence, m.step, m.subject.trim(), m.body, await sha16(m.body), gate, when, nowIso()]);
  await log("agent", m.company_id, "queue", m.key);
  return { ok: true, gate };
}

/** Edit a drafted message: re-lints, keeps it drafted. */
export async function editDraft(key: string, subject: string, body: string) {
  const d = await db();
  const m = (await d.q(`SELECT * FROM messages WHERE key=$1`, [key]))[0];
  if (!m || m.status !== "drafted") return { ok: false, reason: "not_drafted" };
  const problems = lint(subject, body, m.sequence, num(m.step), await getSetting("postal", ""));
  if (problems.length) return { ok: false, reason: "lint", problems };
  await d.q(`UPDATE messages SET subject=$1, body=$2, body_hash=$3 WHERE key=$4`, [subject.trim(), body, await sha16(body), key]);
  return { ok: true };
}

export async function approve(key: string, who: string) {
  const d = await db();
  const m = (await d.q(`SELECT * FROM messages WHERE key=$1`, [key]))[0];
  if (!m || m.status !== "drafted") return { ok: false, reason: "not_drafted" };
  if (!num(m.lint_ok)) return { ok: false, reason: "not_linted" };
  const w = (who || "").trim();
  if (AUTO_NAMES.has(w.toLowerCase())) {
    if (m.gate !== "auto" || (await humanReplyExists(m.company_id))) return { ok: false, reason: "needs_human_approver" };
  } else {
    const allowed = (await getSetting("approvers", "")).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return { ok: false, reason: "set approvers in Settings first" };
    if (!allowed.includes(w.toLowerCase())) return { ok: false, reason: "unknown_approver" };
  }
  await d.q(`UPDATE messages SET status='approved', approved_by=$1 WHERE key=$2`, [w || "auto", key]);
  await log(w || "auto", m.company_id, "approve", key);
  return { ok: true };
}

export async function reject(key: string, who: string) {
  const d = await db();
  await d.q(`UPDATE messages SET status='cancelled', cancel_reason=$1 WHERE key=$2 AND status IN ('drafted','approved')`, [`rejected by ${who}`, key]);
}

export async function blockReason(m: any, at = new Date()): Promise<string | null> {
  if (m.status !== "approved") return "not_approved";
  if (new Date(m.scheduled_for) > at) return "not_yet";
  if (await isSuppressed(m.to_email)) return "suppressed";
  const st = await stageOf(m.company_id);
  if (st && DEAD.includes(st)) return `company_${st.toLowerCase()}`;
  if (m.sequence === "cold") {
    if (!st || !PRE_REPLY.includes(st)) return `cold_blocked_stage_${st}`;
    if (await humanReplyExists(m.company_id)) return "company_replied";
  }
  return null;
}

async function capReason(m: any): Promise<string | null> {
  const d = await db();
  const c = await caps();
  const day = istDayStart();
  const total = num((await d.q(`SELECT COUNT(*) AS n FROM messages WHERE status='sent' AND sent_at >= $1`, [day]))[0]?.n);
  if (total >= c.totalPerDay) return "CAP:total_per_day";
  if (m.sequence === "cold" && num(m.step) === 0) {
    const n = num((await d.q(`SELECT COUNT(*) AS n FROM messages WHERE status='sent' AND sequence='cold' AND step=0 AND sent_at >= $1`, [day]))[0]?.n);
    if (n >= c.newPerDay) return "CAP:new_per_day";
  }
  const last = (await d.q(`SELECT MAX(sent_at) AS t FROM messages WHERE status='sent'`))[0]?.t;
  if (last) {
    const wait = c.spacingSec - Math.floor((Date.now() - new Date(last).getTime()) / 1000);
    if (wait > 0) return `WAIT:${wait}`;
  }
  return null;
}

export async function claim(key: string): Promise<string> {
  const d = await db();
  const m = (await d.q(`SELECT * FROM messages WHERE key=$1`, [key]))[0];
  if (!m || m.status !== "approved") return "ALREADY";
  const br = await blockReason(m);
  if (br) {
    if (br !== "not_yet" && br !== "not_approved") await d.q(`UPDATE messages SET status='cancelled', cancel_reason=$1 WHERE key=$2`, [br, key]);
    return "BLOCKED:" + br;
  }
  const cr = await capReason(m);
  if (cr) return cr;
  const r = await d.q(`UPDATE messages SET status='claimed', claimed_at=$1 WHERE key=$2 AND status='approved' RETURNING key`, [nowIso(), key]);
  return r.length === 1 ? "CLAIMED" : "ALREADY";
}

export async function markSent(key: string, threadId: string, gmailId: string, rfcId = "") {
  const d = await db();
  const r = await d.q(`UPDATE messages SET status='sent', sent_at=$1, thread_id=$2, gmail_id=$3, rfc_message_id=$4 WHERE key=$5 AND status='claimed' RETURNING *`,
    [nowIso(), threadId, gmailId, rfcId, key]);
  const m = r[0];
  if (!m) return { ok: false, reason: "not_claimed" };
  await log("email", m.company_id, "sent", key);
  let next: { key: string; after: string } | null = null;
  if (m.sequence === "cold") {
    const st = await stageOf(m.company_id);
    const nxt = ["CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2"][num(m.step)];
    if (nxt && st && PRE_REPLY.includes(st)) await setStage(m.company_id, nxt, `sent ${key}`, "email");
    const s = num(m.step);
    if (s < COLD_MAX_STEP) next = { key: `${m.contact_id}:cold:${s + 1}`, after: addBusinessDays(new Date(), COLD_GAPS_BD[s + 1]).toISOString() };
  }
  return { ok: true, next };
}

export async function markFailed(key: string) {
  const d = await db();
  await d.q(`UPDATE messages SET status='failed', attempts=attempts+1 WHERE key=$1 AND status='claimed'`, [key]);
}
export async function retry(key: string) {
  const d = await db();
  const m = (await d.q(`SELECT * FROM messages WHERE key=$1`, [key]))[0];
  if (!m || m.status !== "failed") return "NOT_FAILED";
  if (num(m.attempts) >= 3) {
    await addException(m.company_id, "send_failed", `${key} failed 3 times`, "Check the Gmail connection and the address.");
    return "GIVE_UP";
  }
  await d.q(`UPDATE messages SET status='approved' WHERE key=$1`, [key]);
  return "RETRY_APPROVED";
}

export async function due(at = new Date()) {
  const d = await db();
  const rows = await d.q(`SELECT * FROM messages WHERE status='approved' ORDER BY scheduled_for`);
  const out: any[] = [];
  for (const r of rows) if ((await blockReason(r, at)) === null) out.push(r);
  return out;
}

export async function reconcileLists() {
  const d = await db();
  const cutoff = Date.now() - 30 * 60 * 1000;
  const stale = (await d.q(`SELECT * FROM messages WHERE status='claimed'`)).filter((r) => new Date(r.claimed_at).getTime() < cutoff);
  const missing: { next_key: string; contact_id: string; company_id: string; step: number; thread_id: string; subject: string; send_after: string }[] = [];
  for (const r of await d.q(`SELECT * FROM messages WHERE sequence='cold' AND status='sent'`)) {
    const s = num(r.step);
    if (s >= COLD_MAX_STEP) continue;
    const nk = `${r.contact_id}:cold:${s + 1}`;
    if ((await d.q(`SELECT 1 FROM messages WHERE key=$1`, [nk])).length) continue;
    const st = await stageOf(r.company_id);
    if (st && PRE_REPLY.includes(st) && !(await humanReplyExists(r.company_id)) && !(await isSuppressed(r.to_email)))
      missing.push({ next_key: nk, contact_id: r.contact_id, company_id: r.company_id, step: s + 1, thread_id: r.thread_id, subject: r.subject,
        send_after: addBusinessDays(new Date(r.sent_at), COLD_GAPS_BD[s + 1]).toISOString() });
  }
  return { stale, missing };
}

export async function addException(company_id: string | null, kind: string, question: string, recommendation = "", draft_subject = "", draft_body = "") {
  const d = await db();
  const id = uid();
  await d.q(`INSERT INTO exceptions (id, company_id, kind, question, recommendation, draft_subject, draft_body, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8)`,
    [id, company_id, kind, question, recommendation, draft_subject, draft_body, nowIso()]);
  return id;
}

export async function suppress(email: string, reason: string) {
  const d = await db();
  await d.q(`INSERT INTO suppress (email_hash, reason, at) VALUES ($1,$2,$3) ON CONFLICT (email_hash) DO UPDATE SET reason=excluded.reason`, [await emailHash(email), reason, nowIso()]);
  await d.q(`UPDATE messages SET status='cancelled', cancel_reason='suppressed' WHERE lower(to_email)=lower($1) AND status IN ('drafted','approved')`, [email]);
}

export async function forget(email: string) {
  const d = await db();
  await suppress(email, "erasure_request");
  const ids = (await d.q(`SELECT id FROM contacts WHERE lower(email)=lower($1)`, [email])).map((r) => r.id);
  for (const id of ids) {
    await d.q(`UPDATE contacts SET full_name='[erased]', email=NULL, phone=NULL, linkedin_url=NULL, one_liner=NULL, context=NULL, hook=NULL, warm_path=NULL, status='erased' WHERE id=$1`, [id]);
    await d.q(`UPDATE messages SET body='[erased]', subject='[erased]', to_email=NULL, status=CASE WHEN status IN ('drafted','approved') THEN 'cancelled' ELSE status END WHERE contact_id=$1`, [id]);
    await d.q(`UPDATE replies SET summary='[erased]' WHERE contact_id=$1`, [id]);
  }
  await log("manager", null, "forget", `${ids.length} contact(s)`);
  return ids.length;
}

export type ReplyClass = "interested" | "meeting" | "need_info" | "referral" | "not_now" | "not_interested" | "opt_out" | "auto_reply" | "bounce";

export async function recordReply(r: { gmail_id: string; contact_id: string; company_id: string; classification: ReplyClass; summary: string; offer_inr?: number | null; resume_after?: string | null }) {
  const d = await db();
  const ins = await d.q(`INSERT INTO replies (id, gmail_id, contact_id, company_id, received_at, classification, summary, offer_inr, resume_after, handled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0) ON CONFLICT (gmail_id) DO NOTHING RETURNING id`,
    [uid(), r.gmail_id, r.contact_id, r.company_id, nowIso(), r.classification, r.summary, r.offer_inr ?? null, r.resume_after ? parseTime(r.resume_after).toISOString() : null]);
  if (!ins.length) return "DUPLICATE";
  const st = await stageOf(r.company_id);
  const ct = (await d.q(`SELECT email FROM contacts WHERE id=$1`, [r.contact_id]))[0];
  if (r.classification === "auto_reply") {
    if (r.resume_after) {
      const floor = addBusinessDays(parseTime(r.resume_after), 2).toISOString();
      await d.q(`UPDATE messages SET scheduled_for=$1 WHERE contact_id=$2 AND sequence='cold' AND status IN ('drafted','approved') AND scheduled_for < $1`, [floor, r.contact_id]);
    }
    await log("a2", r.company_id, "reply", `auto_reply: sequence continues`);
    return "AUTO_REPLY";
  }
  if (r.classification === "opt_out" || r.classification === "bounce") {
    if (ct?.email) await suppress(ct.email, r.classification);
    await d.q(`UPDATE contacts SET status=$1 WHERE id=$2`, [r.classification === "opt_out" ? "opted_out" : "bounced", r.contact_id]);
    await d.q(`UPDATE messages SET status='cancelled', cancel_reason=$1 WHERE contact_id=$2 AND status IN ('drafted','approved')`, [r.classification, r.contact_id]);
    if (st && PRE_REPLY.includes(st)) await setStage(r.company_id, r.classification === "opt_out" ? "OPTED_OUT" : "BOUNCED", `reply:${r.classification}`, "a2");
    else await addException(r.company_id, "contact_" + r.classification, `Contact ${r.classification} while deal is ${st}: ${r.summary}`);
    return r.classification.toUpperCase();
  }
  await d.q(`UPDATE messages SET status='cancelled', cancel_reason='reply' WHERE company_id=$1 AND sequence='cold' AND status IN ('drafted','approved')`, [r.company_id]);
  await d.q(`UPDATE contacts SET status='replied' WHERE id=$1`, [r.contact_id]);
  if (st && PRE_REPLY.includes(st)) {
    await setStage(r.company_id, r.classification === "not_interested" ? "LOST" : "REPLIED", `reply:${r.classification}`, "a2");
    return "MOVED";
  }
  await addException(r.company_id, "reply_on_live_deal", `${r.classification} while ${st}: ${r.summary}`);
  return "KEPT_STAGE";
}
