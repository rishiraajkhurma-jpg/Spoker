// Workflows that tie agents, ledger and Gmail together. Routes call these. Every agent action is logged.
import { db, nowIso, uid, json, num, getSetting, setSetting } from "./db";
import * as L from "./ledger";
import * as A from "./agents";
import * as G from "./gmail";
import { dataSource } from "./claude";
import * as C from "./contacts";

export const FALLBACK_DECK = "/fallback/sponsorship-deck.pdf";
export const FALLBACK_MOU = "/fallback/mou.pdf";

export async function getEvent(): Promise<A.EventProfile | null> {
  const d = await db();
  const r = await d.q(`SELECT profile FROM events WHERE id='current'`);
  return r[0] ? json<A.EventProfile | null>(r[0].profile, null) : null;
}
async function needEvent() {
  const e = await getEvent();
  if (!e) throw new Error("Start with the event brief: type one line about your event on the Command page.");
  return e;
}
export async function saveEvent(e: A.EventProfile) {
  const d = await db();
  await d.q(`INSERT INTO events (id, profile, updated_at) VALUES ('current', $1, $2) ON CONFLICT (id) DO UPDATE SET profile=excluded.profile, updated_at=excluded.updated_at`, [JSON.stringify(e), nowIso()]);
  const pin = String(e.postal_address || "").match(/\b\d{6}\b/);
  if (e.postal_address) await setSetting("postal", pin ? pin[0] : String(e.postal_address));
}
const firstName = (n?: string) => (n || "there").trim().split(/\s+/)[0];
const slug = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
async function company(id: string): Promise<any> {
  const d = await db();
  const c = (await d.q(`SELECT * FROM companies WHERE id=$1`, [id]))[0];
  if (!c) throw new Error("Unknown company");
  return { ...c, reasons: json(c.reasons, {}), role_map: json(c.role_map, {}) };
}
async function primaryContact(companyId: string) {
  const d = await db();
  return (await d.q(`SELECT * FROM contacts WHERE company_id=$1 AND status <> 'erased' ORDER BY is_primary DESC, created_at LIMIT 1`, [companyId]))[0] || null;
}
export function appUrl(req?: Request) {
  if (req) return new URL(req.url).origin;
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
}

function mergeSources(signals: any[] = [], found: A.Source[] = []) {
  const out: A.Source[] = [];
  for (const g of signals || []) if (/^https?:\/\//.test(g?.source || "") && !out.some((x) => x.url === g.source)) out.push({ url: g.source, title: g.claim });
  for (const s of found || []) if (!out.some((x) => x.url === s.url)) out.push(s);
  return out.slice(0, 15);
}

// ---------- A0 ----------
export async function runBrief(oneLine: string, sender: { name: string; title?: string; phone?: string; email?: string }, answers = "", dry = false) {
  if (!oneLine.trim()) throw new Error("Describe the event in one line.");
  if (!sender?.name) throw new Error("Your name is needed for the email signature.");
  const r = await A.buildBrief(oneLine, sender, answers);
  if (r.status === "clarify") {
    await L.log("A0", null, "clarify", `Could not pin down the event yet (${r.searches} searches, ${r.sources.length} pages). Asked the manager ${r.questions.length} question(s).`);
    return { clarify: { questions: r.questions, found: r.found, sources: r.sources } };
  }
  if (dry) return { profile: r.profile, preview: true, searches: r.searches, verified: r.verified };
  await saveEvent(r.profile);
  await L.log("A0", null, "brief", `Researched "${r.profile.name}": ${r.searches} searches, ${r.verified} verified sources. Suggested floor INR ${r.profile.floor_inr}, waiting for lock.`);
  return { profile: r.profile };
}
export async function lockFloor(floor: number, who: string) {
  const e = await needEvent();
  e.floor_inr = Number(floor) || e.floor_inr;
  e.floor_locked = true;
  await saveEvent(e);
  await L.log(who || "manager", null, "floor_locked", `Floor locked at INR ${e.floor_inr}`);
  return { ok: true };
}

// ---------- A1 ----------
export async function runDiscover(count: number) {
  const e = await needEvent();
  if (!e.floor_locked) throw new Error("Lock the floor price first (Command page). A broker that does not know its floor negotiates itself into a loss.");
  const d = await db();
  const existing = (await d.q(`SELECT name FROM companies`)).map((r) => r.name);
  const { data, raw } = await A.discover(e, Math.min(Math.max(count, 3), 25), existing);
  const added: string[] = [];
  for (const c of data.companies || []) {
    if (!c?.name) continue;
    const id = slug(c.domain || c.name);
    const r = await d.q(`INSERT INTO companies (id, name, domain, segment, stage, stage_reason, why_now, reasons, sources, updated_at)
      VALUES ($1,$2,$3,$4,'PROSPECT','discovered',$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, c.name, c.domain || "", c.segment || "", c.why_now || "", JSON.stringify({ signals: c.signals || [] }), JSON.stringify(raw.sources.slice(0, 12)), nowIso()]);
    if (r.length) { added.push(id); await L.log("A1", id, "discovered", c.why_now || ""); }
  }
  await L.log("A1", null, "discover", `Found ${added.length} companies via ${dataSource()} (${raw.toolCalls.length} searches)`);
  return { added, searches: raw.toolCalls.length };
}

// ---------- A1 + A2 ----------
export async function runAnalyze(companyId: string) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  await L.log("A1", companyId, "researching", `Scoring ${co.name} from both sides`);
  const { data: a, raw } = await A.analyze(e, { name: co.name, domain: co.domain, why_now: co.why_now });
  const our = Math.max(0, Math.min(100, Math.round(num(a.our_pov?.score))));
  const their = Math.max(0, Math.min(100, Math.round(num(a.their_pov?.score))));
  const inter = Math.min(our, their);
  const priority = inter >= 70 ? "P1" : inter >= 50 ? "P2" : inter >= 35 ? "P3" : "DQ";
  const keep = a.decision !== "drop" && priority !== "DQ";
  const reasons = { signals: a.signals || [], our_pov: a.our_pov, their_pov: a.their_pov };
  await d.q(`UPDATE companies SET our_pov=$1, their_pov=$2, intersection=$3, priority=$4, model=$5, tier=$6, price_range=$7, angle=$8,
     audience_benefit=$9, reasons=$10, role_map=$11, decision=$12, sources=$13, draft_subject=$14, draft_body=$15, updated_at=$16 WHERE id=$17`,
    [our, their, inter, priority, a.model || "", a.tier || "", a.price_range || "", a.angle || "", a.audience_benefit || "",
      JSON.stringify(reasons), JSON.stringify(a.role_map || {}), keep ? "keep" : `drop: ${a.drop_reason || "intersection " + inter}`,
      JSON.stringify(mergeSources(a.signals, raw.sources)), a.email?.subject || "", A.tidyBody(a.email?.body || "", firstName(a.contact?.full_name)), nowIso(), companyId]);
  await L.log("A1", companyId, "decision", keep ? `${priority}: ours ${our}, theirs ${their}. ${a.angle}` : `Dropped: ${a.drop_reason || "intersection " + inter + " below 35"}`);
  if (!keep) { await L.setStage(companyId, "DISQUALIFIED", a.drop_reason || `intersection ${inter}`, "A1"); return { priority, dropped: true }; }
  await L.setStage(companyId, "QUALIFIED", `${priority}, intersection ${inter}`, "A1");

  const usedCrustdata = raw.toolCalls.some((t) => /execute|crustdata/i.test(t.name));
  const found = foundContacts(a);
  if (!found.length) {
    await L.addException(companyId, "no_contact", `No decision maker found for ${co.name}.`, "Add a contact by hand, ask the team for a warm intro, or request rediscovery.");
    return { priority, dropped: false, contact: false };
  }
  const kind = C.sponsorKind(co.segment, a.model);
  const checked = await Promise.all(found.map(async (x) => {
    const email = await C.checkEmail({ email: x.email, fullName: x.full_name, companyDomain: co.domain, sourceUrl: /^https?:/.test(x.email_source || "") ? x.email_source : "", sourceKind: x.email_verified_by_crustdata && usedCrustdata ? "crustdata_verified" : "", evidenceDate: x.evidence_date, leftCompany: !!x.left_company });
    const phone = await C.checkPhone({ phone: x.phone, type: x.phone_type, sourceUrl: x.phone_source, companyDomain: co.domain, switchboard: a.company_contact?.phone });
    const sc = C.scoreContact({ position: x.designation, department: x.department, responsibility: x.responsibility, emailStatus: email.status, phoneStatus: phone.status, phoneType: phone.type, evidenceDate: x.evidence_date, companySize: num(a.company_size) }, kind);
    return { x, email, phone, sc };
  }));
  // Primary = most relevant usable person (not outdated); departmental fallbacks only if no person qualifies.
  const ranked = [...checked].sort((p, q) => (Number(q.x.kind !== "fallback") - Number(p.x.kind !== "fallback")) || (q.sc.score - p.sc.score));
  const best = ranked.find((r) => r.email.status !== "OUTDATED") || ranked[0];
  await d.q(`UPDATE contacts SET is_primary=0 WHERE company_id=$1`, [companyId]);
  for (const r of checked) {
    const x = r.x;
    const cid = `${companyId}--${slug(x.full_name || r.email.normalized || x.kind)}`;
    const srcs = [x.email_source, x.phone_source, ...(x.evidence || []).map((ev) => ev.url)].filter((u) => /^https?:/.test(u || ""));
    await d.q(`INSERT INTO contacts (id, company_id, full_name, position, department, email, email_status, email_type, email_source, email_check, phone, phone_status, phone_type, phone_source,
        one_liner, context, hook, iitb_alum, warm_path, source, status, is_primary, kind, relevance, relevance_parts, reason, responsibility, evidence, discovered_at, verified_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$29)
      ON CONFLICT (id) DO UPDATE SET position=excluded.position, department=excluded.department, email=COALESCE(contacts.email, excluded.email), email_status=excluded.email_status, email_type=excluded.email_type,
        email_source=excluded.email_source, email_check=excluded.email_check, phone=excluded.phone, phone_status=excluded.phone_status, phone_type=excluded.phone_type, phone_source=excluded.phone_source,
        is_primary=excluded.is_primary, kind=excluded.kind, relevance=excluded.relevance, relevance_parts=excluded.relevance_parts, reason=excluded.reason, responsibility=excluded.responsibility,
        evidence=excluded.evidence, verified_at=excluded.verified_at`,
      [cid, companyId, x.full_name || "", x.designation || "", x.department || "", r.email.normalized || null, r.email.status, r.email.type || "", x.email_source || "", JSON.stringify(r.email.notes),
        r.phone.normalized || "", r.phone.status, r.phone.type || "", x.phone_source || "", x.one_liner || "", JSON.stringify((x.evidence || []).map((ev) => `${ev.claim}${ev.date ? ` (${ev.date})` : ""}`)),
        x.hook || "", x.iitb_alum || "unknown", x.warm_path || "", srcs[0] || dataSource(), x.kind === "primary" || r === best ? "active" : "backup", r === best ? 1 : 0, x.kind || "alternative", r.sc.score,
        JSON.stringify(r.sc.parts), x.reason || "", x.responsibility || "", JSON.stringify((x.evidence || []).filter((ev) => /^https?:/.test(ev.url || ""))), nowIso(), nowIso()]);
  }
  const primaryId = `${companyId}--${slug(best.x.full_name || best.email.normalized || best.x.kind)}`;
  const ct = best.x;
  await L.log("A2", companyId, "contact", `${ct.full_name}, ${ct.designation || ""}: relevance ${best.sc.score}/100, email ${best.email.status.toLowerCase()}, phone ${best.phone.status.toLowerCase()}`);
  // Ready for outreach only when the primary email is verified or corroborated. Discovery alone is not enough.
  let queued: any = null;
  const email = best.email.normalized;
  if (email && (best.email.status === "VERIFIED" || best.email.status === "CORROBORATED")) {
    await L.setStage(companyId, "CONTACT_READY", `contact ${ct.full_name} (${best.email.status.toLowerCase()})`, "A2");
    if (priority === "P1" || priority === "P2") queued = await queueOffer(companyId);
  } else if (email) {
    await L.addException(companyId, "verify_contact", `${ct.full_name} (${ct.designation}) at ${co.name}: the email ${email} could not be verified (${best.email.notes.join("; ")}).`, "Check it on Decision Makers, then mark the contact as reviewed to prepare the offer.");
  } else {
    await L.addException(companyId, "no_email", `${ct.full_name} (${ct.designation}) has no public professional email.`, "Add an email on Decision Makers when you have one, or pick another contact as primary.");
  }
  void primaryId;
  return { priority, dropped: false, contact: true, queued };
}

/** Normalise the agent's answer (new "contacts" list or the older contact/backup shape). */
function foundContacts(a: A.Analysis): A.FoundContact[] {
  const list = Array.isArray(a.contacts) ? a.contacts.filter((x) => x && (x.full_name || x.email)) : [];
  if (!list.length && a.contact?.full_name) {
    list.push({ kind: "primary", full_name: a.contact.full_name, designation: a.contact.position || "", email: a.contact.email, email_source: a.contact.email_source, email_verified_by_crustdata: a.contact.email_status === "verified", phone: a.contact.phone, one_liner: a.contact.one_liner, hook: a.contact.hook, iitb_alum: a.contact.iitb_alum, warm_path: a.contact.warm_path, evidence: (a.contact.context || []).map((c) => ({ claim: c, url: "" })) });
    if (a.backup_contact?.full_name) list.push({ kind: "alternative", full_name: a.backup_contact.full_name, designation: a.backup_contact.position || "" });
  }
  if (a.company_contact?.email && !list.some((x) => x.kind === "fallback")) list.push({ kind: "fallback", full_name: `${"Company"} contact`, designation: "Official contact", email: a.company_contact.email, email_source: a.company_contact.source, phone: a.company_contact.phone, phone_type: "switchboard", phone_source: a.company_contact.source });
  return list.slice(0, 4);
}

/** A person confirms the contact: unlocks outreach for an unverified address. */
export async function markContactReviewed(contactId: string, who: string) {
  const d = await db();
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [contactId]))[0];
  if (!ct) throw new Error("Unknown contact");
  await d.q(`UPDATE contacts SET reviewed_by=$1, reviewed_at=$2 WHERE id=$3`, [who, nowIso(), contactId]);
  await L.log(who, ct.company_id, "contact_reviewed", ct.full_name);
  let queued: any = null;
  if (num(ct.is_primary) && ct.email) {
    await d.q(`UPDATE exceptions SET status='resolved', resolved_at=$1, note=$2 WHERE company_id=$3 AND kind IN ('verify_contact','no_email') AND status='open'`, [nowIso(), `reviewed by ${who}`, ct.company_id]);
    const st = await L.stageOf(ct.company_id);
    if (st === "QUALIFIED" || st === "PROSPECT") await L.setStage(ct.company_id, "CONTACT_READY", `contact reviewed by ${who}`, who);
    queued = await queueOffer(ct.company_id).catch((e) => ({ ok: false, reason: e.message }));
  }
  return { ok: true, queued };
}

/** Make another contact the primary. Unsent drafts to the old primary are cancelled. */
export async function setPrimaryContact(contactId: string, who: string) {
  const d = await db();
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1 AND status <> 'erased'`, [contactId]))[0];
  if (!ct) throw new Error("Unknown contact");
  await d.q(`UPDATE contacts SET is_primary=0 WHERE company_id=$1`, [ct.company_id]);
  await d.q(`UPDATE contacts SET is_primary=1, status='active' WHERE id=$1`, [contactId]);
  await d.q(`UPDATE messages SET status='cancelled', cancel_reason='primary contact changed' WHERE company_id=$1 AND contact_id<>$2 AND sequence='cold' AND status IN ('drafted','approved')`, [ct.company_id, contactId]);
  await L.log(who, ct.company_id, "primary_contact", ct.full_name);
  return { ok: true };
}

export async function queueOffer(companyId: string) {
  const e = await needEvent();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct?.email) throw new Error("This contact has no email yet.");
  if (!co.draft_body) throw new Error("No offer drafted yet. Run the analysis first.");
  if (["UNVERIFIED", "OUTDATED"].includes(String(ct.email_status)) && !ct.reviewed_at) throw new Error(`${ct.full_name}'s email is not verified. Review it on Decision Makers first.`);
  const body = String(co.draft_body).replace(/^(Hi|Hello|Dear)\s+[^,\n]+,/i, `Hi ${firstName(ct.full_name)},`);
  const q = await L.queue({ key: `${ct.id}:cold:0`, contact_id: ct.id, company_id: companyId, sequence: "cold", step: 0, subject: co.draft_subject || `${co.name} x ${e.name}`, body: A.withSignature(body, e) });
  if (q.ok) await L.log("A2", companyId, "offer_drafted", `Priced offer to ${ct.full_name} waiting for approval`);
  else await L.log("A2", companyId, "offer_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
  return q;
}

export async function setContactEmail(contactId: string, email: string) {
  if (!G.SAFE_EMAIL.test(email.trim())) throw new Error("That does not look like an email address.");
  const d = await db();
  const before = (await d.q(`SELECT c.*, co.domain FROM contacts c LEFT JOIN companies co ON co.id=c.company_id WHERE c.id=$1`, [contactId]))[0];
  if (!before) throw new Error("Unknown contact");
  const chk = await C.checkEmail({ email: email.trim(), fullName: before.full_name, companyDomain: before.domain });
  await d.q(`UPDATE contacts SET email=$1, email_status=$2, email_type=$3, email_source='added by manager', email_check=$4, reviewed_by='manager', reviewed_at=$5, verified_at=$5 WHERE id=$6`,
    [email.trim(), chk.status === "UNAVAILABLE" ? "UNVERIFIED" : chk.status, chk.type || "", JSON.stringify(chk.notes), nowIso(), contactId]);
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [contactId]))[0];
  await L.log("manager", ct.company_id, "email_added", `${ct.full_name} <${email}>`);
  await d.q(`UPDATE exceptions SET status='resolved', resolved_at=$1, note='email added' WHERE company_id=$2 AND kind IN ('no_email','verify_contact') AND status='open'`, [nowIso(), ct.company_id]);
  if (["QUALIFIED", "PROSPECT"].includes(String(await L.stageOf(ct.company_id))) && num(ct.is_primary)) await L.setStage(ct.company_id, "CONTACT_READY", "email added by manager", "manager");
  const q = await queueOffer(ct.company_id).catch((e) => ({ ok: false, reason: e.message }));
  return { ok: true, queued: q };
}

async function lastSent(contactId: string) {
  const d = await db();
  return (await d.q(`SELECT * FROM messages WHERE contact_id=$1 AND status='sent' ORDER BY sent_at DESC LIMIT 1`, [contactId]))[0];
}

export async function draftFollowUp(next: { next_key: string; contact_id: string; company_id: string; step: number; subject: string; send_after: string }) {
  const e = await needEvent();
  const d = await db();
  const co = await company(next.company_id);
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [next.contact_id]))[0];
  const first = (await d.q(`SELECT body FROM messages WHERE contact_id=$1 AND sequence='cold' AND step=0`, [next.contact_id]))[0];
  const body = A.withSignature(await A.followUp(e, co as any, first?.body || "", next.step, firstName(ct?.full_name)), e);
  const subject = next.subject.startsWith("Re:") ? next.subject : `Re: ${next.subject}`;
  const q = await L.queue({ key: next.next_key, contact_id: next.contact_id, company_id: next.company_id, sequence: "cold", step: next.step, subject, body, scheduled_for: next.send_after });
  if (q.ok) { await L.approve(next.next_key, "auto"); await L.log("A2", next.company_id, "followup_scheduled", `Follow-up ${next.step} for ${new Date(next.send_after).toDateString()}`); }
  else await L.log("A2", next.company_id, "followup_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
  return q;
}

export async function sendDue(budgetMs = 200000) {
  const t0 = Date.now();
  const e = await getEvent();
  const out: string[] = [];
  if (!(await G.connectedEmail())) return { sent: 0, notes: ["Gmail is not connected: approved emails wait in the outbox (draft mode)."] };
  let sent = 0;
  for (const m of await L.due()) {
    if (Date.now() - t0 > budgetMs) { out.push("Time budget reached; the rest go in the next run."); break; }
    let c = await L.claim(m.key);
    if (c.startsWith("WAIT:")) {
      const w = Number(c.slice(5));
      if (Date.now() - t0 + w * 1000 > budgetMs) { out.push(`Spacing: next send in ${w}s.`); break; }
      await new Promise((r) => setTimeout(r, w * 1000));
      c = await L.claim(m.key);
    }
    if (c.startsWith("CAP:")) { out.push("Daily cap reached."); break; }
    if (c === "CLAIMED" && m.sequence === "cold" && !(await getSetting("organiser_permission", ""))) {
      const d0 = await db();
      await d0.q(`UPDATE messages SET status='approved', claimed_at=NULL WHERE key=$1`, [m.key]);
      out.push("Cold emails are held until the organisers' written permission is recorded in Settings.");
      break;
    }
    if (c !== "CLAIMED") { out.push(`${m.key}: ${c}`); continue; }
    // Pre-send revalidation: an opt-out or reply may have landed between due() and claim().
    const again = await L.blockReason({ ...m, status: "approved" });
    if (again && again !== "not_yet") { await L.markFailed(m.key); const d1 = await db(); await d1.q(`UPDATE messages SET status='cancelled', cancel_reason=$1 WHERE key=$2 AND status='failed'`, [again, m.key]); out.push(`${m.key}: cancelled before sending (${again})`); continue; }
    let prev: any = null;
    try { prev = await lastSent(m.contact_id); } catch (err: any) { await L.markFailed(m.key).catch(() => {}); out.push(`${m.key}: not sent (database): ${err.message}`); continue; }
    let r: { id: string; threadId: string; rfcId: string };
    try {
      r = await G.send({ to: m.to_email, subject: m.subject, body: m.body, threadId: prev?.thread_id || null, inReplyTo: prev?.rfc_message_id || null, fromName: e?.sender?.name });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Only a 4xx rejection (or no token) proves Gmail did not send it. Timeouts and 5xx are ambiguous.
      const definite = (/^Gmail 4\d\d/.test(msg) && !/^Gmail (408|429)/.test(msg)) || /not connected|token refresh failed/i.test(msg);
      if (definite) { await L.markFailed(m.key); out.push(`${m.key}: not sent: ${msg.slice(0, 160)}`); }
      else { await L.markUnknown(m.key, "", "", msg); out.push(`${m.key}: delivery uncertain; it will be checked against Sent and never resent automatically.`); }
      continue;
    }
    sent++;
    let s: { ok: boolean; next?: any };
    try { s = await L.markSent(m.key, r.threadId, r.id, r.rfcId); }
    catch (err: any) {
      // Gmail accepted it but we could not record that. Never mark it failed (that would resend it).
      await L.markUnknown(m.key, r.id, r.threadId, "sent; saving failed: " + err.message).catch(() => {});
      out.push(`${m.key}: sent, but the record could not be saved; reconcile will confirm it from Gmail.`);
      continue;
    }
    await L.log("Email", m.company_id, "sent", `${m.subject} to ${m.to_email}`).catch(() => {});
    if (s.next) {
      try {
        const d = await db();
        const cur = (await d.q(`SELECT * FROM messages WHERE key=$1`, [m.key]))[0];
        await draftFollowUp({ next_key: s.next.key, contact_id: m.contact_id, company_id: m.company_id, step: num(cur.step) + 1, subject: cur.subject, send_after: s.next.after });
      } catch (err: any) { out.push(`Follow-up draft failed (reconcile will retry): ${err.message}`); }
    }
  }
  return { sent, notes: out };
}

async function handleInbound(co: any, ct: any, gmailId: string, text: string, origin = "") {
  const e = await needEvent();
  const c = await A.classify(text);
  const res = await L.recordReply({ gmail_id: gmailId, contact_id: ct.id, company_id: co.id, classification: c.label as any, summary: c.summary, offer_inr: c.offer_inr, resume_after: c.return_date });
  if (res === "DUPLICATE") return null;
  await L.log("A2", co.id, "reply", `${c.label}: ${c.summary}`);
  if (c.suspicious) await L.addException(co.id, "suspicious_email", `An email from ${ct.full_name} contains instructions aimed at an AI or asks for other companies' data. Read it yourself.`, "Do not act on it automatically.");
  if (["interested", "meeting", "need_info", "referral"].includes(c.label)) {
    if (c.offer_inr && c.offer_inr < (e.floor_inr || 0)) {
      const k = await A.counterOffer(e, co, c.offer_inr, c.summary, firstName(ct.full_name));
      await L.addException(co.id, "below_floor", `${co.name} offered INR ${c.offer_inr.toLocaleString("en-IN")}, below your floor of INR ${e.floor_inr.toLocaleString("en-IN")}.`, ((k as any).floor_warning ? (k as any).floor_warning + " " : "") + k.recommendation, k.subject, A.withSignature(k.body, e));
      await L.log("A5", co.id, "counter_drafted", k.recommendation);
    } else {
      let deckUrl = "";
      if (c.label === "interested" || c.label === "need_info") {
        try { const dk = await buildDeck(co.id); deckUrl = origin ? `${origin}/d/${dk.id}` : `/d/${dk.id}`; } catch { /* deck optional */ }
      }
      const r = await A.draftReply(e, co, c.summary, c.label, firstName(ct.full_name), deckUrl);
      const q = await L.queue({ key: `${ct.id}:reply:${gmailId}`, contact_id: ct.id, company_id: co.id, sequence: "reply", step: 1, subject: r.subject, body: A.withSignature(r.body, e) });
      if (q.ok) await L.log("A2", co.id, "reply_drafted", `Reply to ${ct.full_name} waiting for your approval`);
      else await L.log("A2", co.id, "reply_draft_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
      if (c.label === "meeting") await L.setStage(co.id, "MEETING_REQUESTED", "they asked for a call", "A2");
    }
  }
  return c;
}

export async function checkReplies(origin = "") {
  const me = (await G.connectedEmail()).toLowerCase();
  if (!me) return { checked: 0, found: 0, notes: ["Gmail is not connected"] };
  const d = await db();
  const threads = await d.q(`SELECT DISTINCT thread_id, contact_id, company_id FROM messages WHERE status='sent' AND thread_id IS NOT NULL`);
  let found = 0;
  const seen = new Set((await d.q(`SELECT gmail_id FROM replies`)).map((r) => r.gmail_id));
  for (const t of threads) {
    const co = (await d.q(`SELECT * FROM companies WHERE id=$1`, [t.company_id]))[0];
    const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [t.contact_id]))[0];
    if (!co || !ct) continue;
    const msgs = await G.thread(t.thread_id);
    const extra = ct.email ? await G.fromPerson(ct.email, 30).catch(() => []) : [];
    for (const m of [...msgs, ...extra]) {
      if (seen.has(m.id) || m.from.toLowerCase().includes(me)) continue;
      seen.add(m.id);
      const looksBounce = /mailer-daemon|postmaster/i.test(m.from);
      await handleInbound({ ...co, reasons: json(co.reasons, {}) }, ct, m.id, (looksBounce ? "[delivery failure notice]\n" : "") + `From: ${m.from}\nSubject: ${m.subject}\n\n${m.text}`, origin);
      found++;
    }
  }
  return { checked: threads.length, found };
}

export async function simulateReply(companyId: string, text: string, origin = "") {
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct) throw new Error("This company has no contact yet. Run the analysis first.");
  return handleInbound(co, ct, `sim-${uid()}`, `[SIMULATED REPLY FOR DEMO]\n${text}`, origin);
}

export async function reconcile() {
  const { stale, missing } = await L.reconcileLists();
  const notes: string[] = [];
  const gmailOn = !!(await G.connectedEmail());
  for (const m of stale) {
    if (!gmailOn) { notes.push(`uncertain ${m.key}: connect Gmail to verify`); continue; }
    let match: any = null;
    if (m.gmail_id) match = await G.getMessage(m.gmail_id).catch(() => null);
    if (!match) {
      const after = Math.floor(new Date(m.claimed_at).getTime() / 1000) - 120;
      const hits = await G.searchSent(m.to_email, after).catch(() => []);
      for (const h of hits) if ((await L.sha16(h.text)) === m.body_hash) { match = h; break; }
    }
    if (match) { await L.markSent(m.key, match.threadId, match.id, match.rfcId); notes.push(`confirmed ${m.key} as sent`); continue; }
    // Gmail search can lag: wait, then hand it to a person. Never resend automatically.
    const age = Date.now() - new Date(m.claimed_at).getTime();
    if (age < 6 * 3600 * 1000) notes.push(`${m.key}: not in Sent yet, checking again next run`);
    else { await L.markNeedsReview(m.key, "not found in Gmail Sent after 6 hours"); notes.push(`${m.key}: needs a person to check Sent`); }
  }
  // Definite failures (Gmail rejected them, nothing was sent) are retried up to 3 times; then a person decides.
  const d = await db();
  for (const f of await d.q(`SELECT key FROM messages WHERE status='failed'`)) notes.push(`${f.key}: ${await L.retry(f.key)}`);
  for (const n of missing) {
    try { await draftFollowUp(n); notes.push(`queued missing ${n.next_key}`); } catch (err: any) { notes.push(`missing ${n.next_key}: ${err.message}`); }
  }
  return { stale: stale.length, missing: missing.length, notes };
}

export async function cycle(origin = "") {
  const out: any = {};
  out.reconcile = await reconcile();
  out.replies = await checkReplies(origin).catch((e) => ({ error: e.message }));
  out.send = await sendDue(150000);
  await L.log("Orchestrator", null, "cycle", `Daily cycle: sent ${out.send.sent}, new replies ${out.replies.found ?? 0}`);
  return out;
}

// ---------- A3 ----------
export async function scheduleMeeting(companyId: string, template: string, slots: string[]) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct?.email) throw new Error("This contact has no email yet.");
  const n = num(co.meeting_count) + 1;
  const last = (await d.q(`SELECT digest FROM meetings WHERE company_id=$1 ORDER BY n DESC LIMIT 1`, [companyId]))[0];
  const r = await A.scheduleEmail(e, co, firstName(ct.full_name), template, slots, n, last ? json<any>(last.digest, {}).summary : "");
  const q = await L.queue({ key: `${ct.id}:meeting:${n}:${Date.now()}`, contact_id: ct.id, company_id: companyId, sequence: "meeting", step: n, subject: r.subject, body: A.withSignature(r.body, e) });
  if (q.ok) { await L.setStage(companyId, "MEETING_REQUESTED", `meeting ${n} slots offered`, "A3"); await L.log("A3", companyId, "slots_drafted", `Meeting ${n}: ${slots.join("; ")}`); }
  return q;
}

export async function confirmMeeting(companyId: string, startIso: string, minutes: number, who: string, origin = "", verified = false) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct?.email) throw new Error("This contact has no email yet.");
  if (!verified) {
    const allowed = (await getSetting("approvers", "")).split(",").map((s) => s.trim().toLowerCase());
    if (!allowed.includes((who || "").toLowerCase())) throw new Error("Only an approver can confirm meetings.");
  }
  const start = L.parseTime(startIso);
  if (isNaN(start.getTime())) throw new Error("Pick a valid meeting time.");
  // Idempotent: the same company and start time is one meeting, one invite.
  const dupe = (await d.q(`SELECT meet_link FROM meetings WHERE company_id=$1 AND start_at=$2 AND status IN ('scheduled','invite_failed')`, [companyId, start.toISOString()]))[0];
  if (dupe) return { ok: true, link: dupe.meet_link || "", duplicate: true };
  const n = num(co.meeting_count) + 1;
  const deck = co.deck_id ? `${origin}/d/${co.deck_id}` : "";
  let link = "", eventId = "", status = "scheduled";
  if (await G.connectedEmail()) {
    try {
      const ev = await G.createMeet({ requestId: `sd-${companyId}-${start.getTime()}`.slice(0, 60), summary: `${co.name} x ${e.name}: partnership call`, description: `Agenda: your goals, options that fit them, next steps.${deck ? "\nPlan: " + deck : ""}`, startIso: start.toISOString(), minutes, attendees: [ct.email] });
      link = ev.link; eventId = ev.id;
    } catch (err: any) {
      status = "invite_failed";
      await L.addException(companyId, "calendar_failed", `The calendar invite for ${co.name} (${startIso}) could not be created: ${String(err.message).slice(0, 160)}`, "Reconnect Google in Settings, or send the invite by hand.");
    }
  }
  await d.q(`INSERT INTO meetings (id, company_id, n, start_at, minutes, meet_link, event_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid(), companyId, n, start.toISOString(), minutes, link, eventId, status, nowIso()]);
  await d.q(`UPDATE companies SET meeting_count=$1 WHERE id=$2`, [n, companyId]);
  await L.setStage(companyId, "MEETING_SCHEDULED", `meeting ${n} on ${startIso}`, "A3");
  await L.log("A3", companyId, "meeting_booked", link ? `Calendar invite with Meet link sent to ${ct.email}` : `Meeting ${n} recorded (connect Google to send invites automatically)`);
  if (!co.deck_id) { try { await buildDeck(companyId); } catch { /* optional */ } }
  return { ok: true, link };
}

// ---------- A4 ----------
export async function buildDeck(companyId: string) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  const notes = (await d.q(`SELECT digest FROM meetings WHERE company_id=$1 AND digest IS NOT NULL ORDER BY n`, [companyId])).map((m) => json<any>(m.digest, {}).summary).filter(Boolean).join(" | ");
  // If the agent cannot build a deck, the organiser's standard deck PDF is used instead.
  let deck: any;
  try { deck = await A.makeDeck(e, co, ct, notes); if (!deck?.slides?.length) throw new Error("empty deck"); }
  catch { deck = { title: `${co.name} x ${e.name}`, fallback_pdf: FALLBACK_DECK }; }
  const id = uid().replace(/-/g, "").slice(0, 20);
  await d.q(`INSERT INTO decks (id, company_id, json, created_at) VALUES ($1,$2,$3,$4)`, [id, companyId, JSON.stringify({ ...deck, event: { name: e.name, organizer: e.organizer, dates: e.dates, city: e.city }, company: co.name, contacts: e.sender }), nowIso()]);
  await d.q(`UPDATE companies SET deck_id=$1 WHERE id=$2`, [id, companyId]);
  await L.log("A4", companyId, "deck_built", deck.fallback_pdf ? "Sponsorship deck ready" : `${deck.slides?.length || 0} slides + talk track`);
  return { id };
}

// ---------- A5 ----------
export async function findGeminiNotes(companyId: string) {
  if (!(await G.connectedEmail())) throw new Error("Connect Google in Settings to pull Gemini notes from Gmail, or paste the notes.");
  const co = await company(companyId);
  const hits = await G.search(`newer_than:14d (subject:notes OR from:gemini-notes@google.com OR from:meetings-noreply@google.com) "${co.name}"`, 3);
  if (!hits.length) throw new Error("No Gemini notes email found for this company in the last 14 days. Paste the notes instead.");
  return { text: hits[0].text, subject: hits[0].subject };
}

export async function ingestNotes(companyId: string, notes: string) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!notes.trim()) throw new Error("Paste the meeting notes or transcript.");
  const g = await A.digestMeeting(e, co, notes, firstName(ct?.full_name));
  const m = (await d.q(`SELECT id FROM meetings WHERE company_id=$1 ORDER BY n DESC LIMIT 1`, [companyId]))[0];
  if (m) await d.q(`UPDATE meetings SET notes=$1, digest=$2, status='done' WHERE id=$3`, [notes.slice(0, 20000), JSON.stringify(g), m.id]);
  else await d.q(`INSERT INTO meetings (id, company_id, n, status, notes, digest, created_at) VALUES ($1,$2,$3,'done',$4,$5,$6)`, [uid(), companyId, num(co.meeting_count) + 1, notes.slice(0, 20000), JSON.stringify(g), nowIso()]);
  await L.setStage(companyId, "NEGOTIATING", `meeting digested: ${g.temperature || ""}`, "A5");
  await L.log("A5", companyId, "meeting_digested", g.summary || "");
  if (ct?.email && g.recap?.body) {
    const q = await L.queue({ key: `${ct.id}:recap:${Date.now()}`, contact_id: ct.id, company_id: companyId, sequence: "recap", step: 1, subject: g.recap.subject || `Re: ${co.name} x ${e.name}`, body: A.withSignature(g.recap.body, e) });
    if (q.ok) await L.log("A5", companyId, "recap_drafted", "Recap email waiting for your approval");
  } else if (g.recap?.body) {
    await L.addException(companyId, "recap_no_email", `Recap for ${co.name} is ready, but ${ct?.full_name || "the contact"} has no email yet. Add it on the company page, then approve this.`, "Add the email, then approve to queue the recap.", g.recap.subject || `Re: ${co.name} x ${e.name}`, A.withSignature(g.recap.body, e));
  }
  for (const x of g.exceptions || []) if (x) await L.addException(companyId, "meeting_exception", `${co.name}: ${x}`, "Decide before the next touch.");
  if (g.offer_inr && g.offer_inr < e.floor_inr) {
    const k = await A.counterOffer(e, co, g.offer_inr, g.summary, firstName(ct?.full_name));
    await L.addException(companyId, "below_floor", `${co.name} mentioned INR ${Number(g.offer_inr).toLocaleString("en-IN")}, below your floor.`, ((k as any).floor_warning ? (k as any).floor_warning + " " : "") + k.recommendation, k.subject, A.withSignature(k.body, e));
  }
  return g;
}

// ---------- A6 ----------
export async function makeMou(companyId: string, deal: any) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  // If the agent cannot draft the MOU, the organiser's standard MOU PDF is used instead.
  let md = "", pdf: string | null = null;
  try { md = await A.mou(e, co, deal); if (!md.trim()) throw new Error("empty MOU"); }
  catch { md = ""; pdf = FALLBACK_MOU; }
  const share = uid().replace(/-/g, "").slice(0, 20);
  await d.q(`INSERT INTO deals (company_id, tier, cash_inr, in_kind, deliverables, mou, mou_pdf, status, share_id, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9)
     ON CONFLICT (company_id) DO UPDATE SET tier=excluded.tier, cash_inr=excluded.cash_inr, in_kind=excluded.in_kind, deliverables=excluded.deliverables, mou=excluded.mou, mou_pdf=excluded.mou_pdf, status='draft', share_id=excluded.share_id, updated_at=excluded.updated_at`,
    [companyId, deal.tier, num(deal.cash_inr), deal.in_kind || "", deal.deliverables || "", md, pdf, share, nowIso()]);
  if (num(deal.cash_inr) && num(deal.cash_inr) < e.floor_inr)
    await L.addException(companyId, "below_floor_mou", `MOU cash INR ${deal.cash_inr} is below the floor INR ${e.floor_inr}.`, "Approve only if the trade is worth it.");
  await L.setStage(companyId, "MOU_DRAFTED", `MOU for ${deal.tier}`, "A6");
  await L.log("A6", companyId, "mou_drafted", `${deal.tier}, INR ${num(deal.cash_inr).toLocaleString("en-IN")}`);
  return { mou: md, share };
}

export async function sendMou(companyId: string, origin: string) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  const deal = (await d.q(`SELECT * FROM deals WHERE company_id=$1`, [companyId]))[0];
  if (!deal || !ct?.email) throw new Error("Draft the MOU and make sure the contact has an email.");
  const body = deal.mou_pdf
    ? `Hi ${firstName(ct.full_name)},\n\nAs discussed, here is the MOU for ${co.name}'s ${deal.tier} partnership with ${e.name}: ${origin}/m/${deal.share_id}\n\nIf your legal team wants to adjust anything, mark it up and I will take it to our side.`
    : `Hi ${firstName(ct.full_name)},\n\nAs discussed, here is the MOU for ${co.name}'s ${deal.tier} partnership with ${e.name}: ${origin}/m/${deal.share_id}\n\nPage 1 lists exactly what ${co.name} receives; the next part covers payment and brand approvals. If your legal team wants to adjust anything, mark it up and I will take it to our side.`;
  const q = await L.queue({ key: `${ct.id}:mou:${deal.share_id}`, contact_id: ct.id, company_id: companyId, sequence: "mou", step: 1, subject: `MOU: ${co.name} x ${e.name}`, body: A.withSignature(body, e) });
  if (q.ok) await L.log("A6", companyId, "mou_email_drafted", "MOU email waiting for your approval");
  return q;
}

// ---------- A7 ----------
export async function nurture(news: string) {
  const e = await needEvent();
  const d = await db();
  if (!news.trim()) throw new Error("Write what happened this fortnight (posts, numbers, milestones).");
  const signed = await d.q(`SELECT * FROM companies WHERE stage IN ('MOU_SENT','MOU_SIGNED','PO_RECEIVED','INVOICED','PAID','INKIND_CONFIRMED','NURTURE')`);
  let drafted = 0;
  for (const c of signed) {
    const ct = await primaryContact(c.id);
    if (!ct?.email) continue;
    const deal = (await d.q(`SELECT * FROM deals WHERE company_id=$1`, [c.id]))[0];
    const u = await A.sponsorUpdate(e, c, deal, news, firstName(ct.full_name));
    const q = await L.queue({ key: `${ct.id}:nurture:${Date.now()}`, contact_id: ct.id, company_id: c.id, sequence: "nurture", step: 1, subject: u.subject, body: A.withSignature(u.body, e) });
    if (q.ok) { drafted++; await L.log("A7", c.id, "update_drafted", u.subject); }
  }
  return { drafted, sponsors: signed.length };
}

export async function resolveException(id: string, action: "approve" | "reject", who: string, note = "", subject?: string, body?: string, verified = false) {
  const d = await db();
  const x = (await d.q(`SELECT * FROM exceptions WHERE id=$1`, [id]))[0];
  if (!x || x.status !== "open") throw new Error("Exception not open");
  if (!verified) {
    const allowed = (await getSetting("approvers", "")).split(",").map((s) => s.trim().toLowerCase());
    if (!allowed.includes((who || "").toLowerCase())) throw new Error("Only an approver can decide this.");
  }
  let queued: any = null;
  if (action === "approve" && (body || x.draft_body)) {
    const ct = await primaryContact(x.company_id);
    if (ct) {
      const key = `${ct.id}:exception:${id}`;
      queued = await L.queue({ key, contact_id: ct.id, company_id: x.company_id, sequence: "reply", step: 1, subject: subject || x.draft_subject, body: body || x.draft_body });
      if (queued.ok) await L.approve(key, who, verified);
    }
  }
  if (queued && !queued.ok) return { ok: false, queued };
  await d.q(`UPDATE exceptions SET status=$1, resolved_at=$2, note=$3 WHERE id=$4`, [action === "approve" ? "approved" : "rejected", nowIso(), `${who}: ${note}`, id]);
  await L.log(who, x.company_id, `exception_${action}`, x.kind);
  if (x.kind === "below_floor" && action === "approve") await L.setStage(x.company_id, "NEGOTIATING", "counter-offer approved", who);
  return { ok: true, queued };
}
