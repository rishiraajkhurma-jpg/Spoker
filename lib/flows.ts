// Workflows that tie agents, ledger and Gmail together. Routes call these. Every agent action is logged.
import { db, nowIso, uid, json, num, getSetting, setSetting } from "./db";
import * as L from "./ledger";
import * as A from "./agents";
import * as G from "./gmail";
import { dataSource } from "./claude";

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
  if (!(await getSetting("approvers", "")) && e.sender?.name) await setSetting("approvers", e.sender.name);
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

// ---------- A0 ----------
export async function runBrief(oneLine: string, sender: { name: string; title?: string; phone?: string; email?: string }) {
  if (!oneLine.trim()) throw new Error("Describe the event in one line.");
  if (!sender?.name) throw new Error("Your name is needed for the email signature.");
  const { profile, searches } = await A.buildBrief(oneLine, sender);
  await saveEvent(profile);
  await L.log("A0", null, "brief", `Researched "${profile.name}" with ${searches} web searches, ${profile.sources?.length || 0} sources. Suggested floor INR ${profile.floor_inr}, waiting for lock.`);
  return { profile };
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
      JSON.stringify(raw.sources.slice(0, 15)), a.email?.subject || "", a.email?.body || "", nowIso(), companyId]);
  await L.log("A1", companyId, "decision", keep ? `${priority}: ours ${our}, theirs ${their}. ${a.angle}` : `Dropped: ${a.drop_reason || "intersection " + inter + " below 35"}`);
  if (!keep) { await L.setStage(companyId, "DISQUALIFIED", a.drop_reason || `intersection ${inter}`, "A1"); return { priority, dropped: true }; }
  await L.setStage(companyId, "QUALIFIED", `${priority}, intersection ${inter}`, "A1");

  const ct = a.contact;
  if (!ct || !ct.full_name) {
    await L.addException(companyId, "no_contact", `No decision maker found for ${co.name}.`, "Add a contact by hand or ask the team for a warm intro.");
    return { priority, dropped: false, contact: false };
  }
  const email = ct.email && /@/.test(ct.email) ? ct.email.trim() : "";
  const cid = `${companyId}--${slug(email || ct.full_name)}`;
  await d.q(`INSERT INTO contacts (id, company_id, full_name, position, email, email_status, email_source, phone, linkedin_url, one_liner, context, hook, iitb_alum, warm_path, source, status, is_primary, linkedin_note, linkedin_dm, linkedin_status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',1,$16,$17,'to_send',$18) ON CONFLICT (id) DO UPDATE SET linkedin_note=excluded.linkedin_note, linkedin_dm=excluded.linkedin_dm`,
    [cid, companyId, ct.full_name, ct.position || "", email || null, email ? (ct.email_status || "public") : "not_found", ct.email_source || "", ct.phone || "", ct.linkedin_url || "", ct.one_liner || "",
      JSON.stringify(ct.context || []), ct.hook || "", ct.iitb_alum || "unknown", ct.warm_path || "", ct.source || dataSource(), a.linkedin?.note || "", a.linkedin?.dm || "", nowIso()]);
  if (a.backup_contact?.full_name) {
    await d.q(`INSERT INTO contacts (id, company_id, full_name, position, linkedin_url, email_status, source, status, is_primary, created_at) VALUES ($1,$2,$3,$4,$5,'not_found',$6,'backup',0,$7) ON CONFLICT (id) DO NOTHING`,
      [`${companyId}--${slug(a.backup_contact.full_name)}`, companyId, a.backup_contact.full_name, a.backup_contact.position || "", a.backup_contact.linkedin_url || "", dataSource(), nowIso()]);
  }
  await L.log("A2", companyId, "contact", `${ct.full_name}, ${ct.position || ""}${email ? "" : " (no public email; LinkedIn queue)"}`);
  await L.setStage(companyId, "CONTACT_READY", `contact ${ct.full_name}`, "A2");
  let queued: any = null;
  if (email && (priority === "P1" || priority === "P2")) queued = await queueOffer(companyId);
  else if (!email) await L.addException(companyId, "no_email", `${ct.full_name} (${ct.position}) has no public email. The LinkedIn note is ready; paste an email on the company page when you have one and the offer will be queued.`, "Send the LinkedIn note, or ask for a warm intro.");
  return { priority, dropped: false, contact: true, queued };
}

export async function queueOffer(companyId: string) {
  const e = await needEvent();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct?.email) throw new Error("This contact has no email yet.");
  if (!co.draft_body) throw new Error("No offer drafted yet. Run the analysis first.");
  const q = await L.queue({ key: `${ct.id}:cold:0`, contact_id: ct.id, company_id: companyId, sequence: "cold", step: 0, subject: co.draft_subject || `${co.name} x ${e.name}`, body: A.withSignature(co.draft_body, e) });
  if (q.ok) await L.log("A2", companyId, "offer_drafted", `Priced offer to ${ct.full_name} waiting for approval`);
  else await L.log("A2", companyId, "offer_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
  return q;
}

export async function setContactEmail(contactId: string, email: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That does not look like an email address.");
  const d = await db();
  await d.q(`UPDATE contacts SET email=$1, email_status='manual', email_source='added by manager' WHERE id=$2`, [email.trim(), contactId]);
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [contactId]))[0];
  await L.log("manager", ct.company_id, "email_added", `${ct.full_name} <${email}>`);
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
    try {
      const prev = await lastSent(m.contact_id);
      const r = await G.send({ to: m.to_email, subject: m.subject, body: m.body, threadId: prev?.thread_id || null, inReplyTo: prev?.rfc_message_id || null, fromName: e?.sender?.name });
      const s = await L.markSent(m.key, r.threadId, r.id, r.rfcId);
      sent++;
      await L.log("Email", m.company_id, "sent", `${m.subject} to ${m.to_email}`);
      if (s.next) {
        const d = await db();
        const cur = (await d.q(`SELECT * FROM messages WHERE key=$1`, [m.key]))[0];
        try { await draftFollowUp({ next_key: s.next.key, contact_id: m.contact_id, company_id: m.company_id, step: num(cur.step) + 1, subject: cur.subject, send_after: s.next.after }); }
        catch (err: any) { out.push(`Follow-up draft failed (reconcile will retry): ${err.message}`); }
      }
    } catch (err: any) {
      await L.markFailed(m.key);
      out.push(`${m.key}: send failed: ${err.message}`);
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
      await L.addException(co.id, "below_floor", `${co.name} offered INR ${c.offer_inr.toLocaleString("en-IN")}, below your floor of INR ${e.floor_inr.toLocaleString("en-IN")}.`, k.recommendation, k.subject, A.withSignature(k.body, e));
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
    if (!gmailOn) { notes.push(`stale ${m.key}: connect Gmail to verify`); continue; }
    const after = Math.floor(new Date(m.claimed_at).getTime() / 1000) - 120;
    const hits = await G.searchSent(m.to_email, after).catch(() => []);
    let match: any = null;
    for (const h of hits) if ((await L.sha16(h.text)) === m.body_hash) { match = h; break; }
    if (match) { await L.markSent(m.key, match.threadId, match.id, match.rfcId); notes.push(`recovered ${m.key} as sent`); }
    else { await L.markFailed(m.key); notes.push(`${m.key}: ${await L.retry(m.key)}`); }
  }
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

export async function confirmMeeting(companyId: string, startIso: string, minutes: number, who: string, origin = "") {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const ct = await primaryContact(companyId);
  if (!ct?.email) throw new Error("This contact has no email yet.");
  const allowed = (await getSetting("approvers", "")).split(",").map((s) => s.trim().toLowerCase());
  if (!allowed.includes((who || "").toLowerCase())) throw new Error("Pick an approver name (Settings).");
  const n = num(co.meeting_count) + 1;
  const deck = co.deck_id ? `${origin}/d/${co.deck_id}` : "";
  let link = "", eventId = "";
  if (await G.connectedEmail()) {
    const ev = await G.createMeet({ summary: `${co.name} x ${e.name}: partnership call`, description: `Agenda: your goals, options that fit them, next steps.${deck ? "\nPlan: " + deck : ""}`, startIso: L.parseTime(startIso).toISOString(), minutes, attendees: [ct.email] });
    link = ev.link; eventId = ev.id;
  }
  await d.q(`INSERT INTO meetings (id, company_id, n, start_at, minutes, meet_link, event_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8)`,
    [uid(), companyId, n, L.parseTime(startIso).toISOString(), minutes, link, eventId, nowIso()]);
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
  const deck = await A.makeDeck(e, co, ct, notes);
  const id = uid().replace(/-/g, "").slice(0, 20);
  await d.q(`INSERT INTO decks (id, company_id, json, created_at) VALUES ($1,$2,$3,$4)`, [id, companyId, JSON.stringify({ ...deck, event: { name: e.name, organizer: e.organizer, dates: e.dates, city: e.city }, company: co.name, contacts: e.sender }), nowIso()]);
  await d.q(`UPDATE companies SET deck_id=$1 WHERE id=$2`, [id, companyId]);
  await L.log("A4", companyId, "deck_built", `${deck.slides?.length || 0} slides + talk track`);
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
  }
  for (const x of g.exceptions || []) if (x) await L.addException(companyId, "meeting_exception", `${co.name}: ${x}`, "Decide before the next touch.");
  if (g.offer_inr && g.offer_inr < e.floor_inr) {
    const k = await A.counterOffer(e, co, g.offer_inr, g.summary, firstName(ct?.full_name));
    await L.addException(companyId, "below_floor", `${co.name} mentioned INR ${Number(g.offer_inr).toLocaleString("en-IN")}, below your floor.`, k.recommendation, k.subject, A.withSignature(k.body, e));
  }
  return g;
}

// ---------- A6 ----------
export async function makeMou(companyId: string, deal: any) {
  const e = await needEvent();
  const d = await db();
  const co = await company(companyId);
  const md = await A.mou(e, co, deal);
  const share = uid().replace(/-/g, "").slice(0, 20);
  await d.q(`INSERT INTO deals (company_id, tier, cash_inr, in_kind, deliverables, mou, status, share_id, updated_at) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)
     ON CONFLICT (company_id) DO UPDATE SET tier=excluded.tier, cash_inr=excluded.cash_inr, in_kind=excluded.in_kind, deliverables=excluded.deliverables, mou=excluded.mou, status='draft', share_id=excluded.share_id, updated_at=excluded.updated_at`,
    [companyId, deal.tier, num(deal.cash_inr), deal.in_kind || "", deal.deliverables || "", md, share, nowIso()]);
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
  const body = `Hi ${firstName(ct.full_name)},\n\nAs discussed, here is the MOU for ${co.name}'s ${deal.tier} partnership with ${e.name}: ${origin}/m/${deal.share_id}\n\nPage 1 lists exactly what ${co.name} receives; the next part covers payment and brand approvals. If your legal team wants to adjust anything, mark it up and I will take it to our side.`;
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

export async function resolveException(id: string, action: "approve" | "reject", who: string, note = "", subject?: string, body?: string) {
  const d = await db();
  const x = (await d.q(`SELECT * FROM exceptions WHERE id=$1`, [id]))[0];
  if (!x || x.status !== "open") throw new Error("Exception not open");
  const allowed = (await getSetting("approvers", "")).split(",").map((s) => s.trim().toLowerCase());
  if (!allowed.includes((who || "").toLowerCase())) throw new Error("Pick an approver name (Settings).");
  let queued: any = null;
  if (action === "approve" && (body || x.draft_body)) {
    const ct = await primaryContact(x.company_id);
    if (ct) {
      const key = `${ct.id}:exception:${id}`;
      queued = await L.queue({ key, contact_id: ct.id, company_id: x.company_id, sequence: "reply", step: 1, subject: subject || x.draft_subject, body: body || x.draft_body });
      if (queued.ok) await L.approve(key, who);
    }
  }
  if (queued && !queued.ok) return { ok: false, queued };
  await d.q(`UPDATE exceptions SET status=$1, resolved_at=$2, note=$3 WHERE id=$4`, [action === "approve" ? "approved" : "rejected", nowIso(), `${who}: ${note}`, id]);
  await L.log(who, x.company_id, `exception_${action}`, x.kind);
  if (x.kind === "below_floor" && action === "approve") await L.setStage(x.company_id, "NEGOTIATING", "counter-offer approved", who);
  return { ok: true, queued };
}
