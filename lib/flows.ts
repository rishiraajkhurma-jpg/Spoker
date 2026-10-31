// Workflows that tie agents, ledger and Gmail together. Routes call these.
import { db, nowIso, uid, json, num, getSetting } from "./db";
import * as L from "./ledger";
import * as A from "./agents";
import * as G from "./gmail";

export async function getEvent(): Promise<A.EventProfile | null> {
  const d = await db();
  const r = await d.q(`SELECT profile FROM events WHERE id='current'`);
  return r[0] ? json<A.EventProfile | null>(r[0].profile, null) : null;
}
async function needEvent() {
  const e = await getEvent();
  if (!e) throw new Error("Save the event brief first (Brief tab).");
  return e;
}
const firstName = (n?: string) => (n || "there").trim().split(/\s+/)[0];
const slug = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function runDiscover(count: number) {
  const e = await needEvent();
  const d = await db();
  const existing = (await d.q(`SELECT name FROM companies`)).map((r) => r.name);
  const { data, raw } = await A.discover(e, Math.min(Math.max(count, 3), 30), existing);
  let added = 0;
  for (const c of data.companies || []) {
    if (!c?.name) continue;
    const id = slug(c.domain || c.name);
    const r = await d.q(`INSERT INTO companies (id, name, domain, segment, stage, stage_reason, why_now, reasons, updated_at)
      VALUES ($1,$2,$3,$4,'PROSPECT','discovered',$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, c.name, c.domain || "", c.segment || "", c.why_now || "", JSON.stringify(c.signals || []), nowIso()]);
    if (r.length) { added++; await L.log("a1", id, "discover", c.why_now || ""); }
  }
  return { added, toolCalls: raw.toolCalls.length };
}

export async function runAnalyze(companyId: string) {
  const e = await needEvent();
  const d = await db();
  const co = (await d.q(`SELECT * FROM companies WHERE id=$1`, [companyId]))[0];
  if (!co) throw new Error("Unknown company");
  const { data: a, raw } = await A.analyze(e, { name: co.name, domain: co.domain, why_now: co.why_now });
  const our = Math.max(0, Math.min(100, Math.round(num(a.our_pov?.score))));
  const their = Math.max(0, Math.min(100, Math.round(num(a.their_pov?.score))));
  const inter = Math.min(our, their);
  const priority = inter >= 70 ? "P1" : inter >= 50 ? "P2" : inter >= 35 ? "P3" : "DQ";
  const keep = a.decision !== "drop" && priority !== "DQ";
  const reasons = { signals: a.signals || [], our_pov: a.our_pov, their_pov: a.their_pov };
  await d.q(`UPDATE companies SET our_pov=$1, their_pov=$2, intersection=$3, priority=$4, model=$5, tier=$6, price_range=$7, angle=$8,
     audience_benefit=$9, reasons=$10, role_map=$11, decision=$12, updated_at=$13 WHERE id=$14`,
    [our, their, inter, priority, a.model || "", a.tier || "", a.price_range || "", a.angle || "", a.audience_benefit || "",
      JSON.stringify(reasons), JSON.stringify(a.role_map || {}), keep ? "keep" : `drop: ${a.drop_reason || "intersection " + inter}`, nowIso(), companyId]);
  await L.log("a1", companyId, "decision", keep ? `keep ${priority} (our ${our}, their ${their}): ${a.angle}` : `DROPPED: ${a.drop_reason || "intersection " + inter + " below 35"}`);
  if (!keep) { await L.setStage(companyId, "DISQUALIFIED", a.drop_reason || `intersection ${inter}`, "a1"); return { priority, dropped: true, toolCalls: raw.toolCalls.length }; }
  await L.setStage(companyId, "QUALIFIED", `${priority}, intersection ${inter}`, "a1");

  let queued: any = null;
  const ct = a.contact;
  if (ct && ct.email && ct.full_name) {
    const cid = `${companyId}--${slug(ct.email)}`;
    await d.q(`INSERT INTO contacts (id, company_id, full_name, position, email, email_status, phone, linkedin_url, one_liner, context, hook, iitb_alum, warm_path, source, status, is_primary, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',1,$15) ON CONFLICT (id) DO NOTHING`,
      [cid, companyId, ct.full_name, ct.position || "", ct.email, ct.email_status || "unknown", ct.phone || "", ct.linkedin_url || "", ct.one_liner || "",
        JSON.stringify(ct.context || []), ct.hook || "", ct.iitb_alum || "unknown", ct.warm_path || "", ct.source || "crustdata", nowIso()]);
    await L.setStage(companyId, "CONTACT_READY", `contact ${ct.full_name}`, "a2");
    if (a.email?.body && (priority === "P1" || priority === "P2")) {
      const body = A.withSignature(a.email.body, e);
      queued = await L.queue({ key: `${cid}:cold:0`, contact_id: cid, company_id: companyId, sequence: "cold", step: 0, subject: a.email.subject, body });
      if (queued.ok && ct.email_status !== "verified")
        await L.addException(companyId, "unverified_email", `${ct.full_name} <${ct.email}> is ${ct.email_status || "unknown"}. Approve the draft only if you accept the bounce risk.`, "Prefer a verified contact or a warm intro.");
      if (!queued.ok) await L.log("a2", companyId, "queue_refused", `${queued.reason} ${(queued.problems || []).join("; ")}`);
    }
  } else {
    await L.addException(companyId, "no_contact", `No verified decision maker found for ${co.name}.`, "Find a warm intro or add a contact by hand.");
  }
  return { priority, dropped: false, queued, toolCalls: raw.toolCalls.length };
}

async function lastSent(contactId: string) {
  const d = await db();
  return (await d.q(`SELECT * FROM messages WHERE contact_id=$1 AND status='sent' ORDER BY sent_at DESC LIMIT 1`, [contactId]))[0];
}

export async function draftFollowUp(next: { next_key: string; contact_id: string; company_id: string; step: number; subject: string; send_after: string }) {
  const e = await needEvent();
  const d = await db();
  const co = (await d.q(`SELECT * FROM companies WHERE id=$1`, [next.company_id]))[0];
  const ct = (await d.q(`SELECT * FROM contacts WHERE id=$1`, [next.contact_id]))[0];
  const first = (await d.q(`SELECT body FROM messages WHERE contact_id=$1 AND sequence='cold' AND step=0`, [next.contact_id]))[0];
  const body = A.withSignature(await A.followUp(e, co as any, first?.body || "", next.step, firstName(ct?.full_name)), e);
  const subject = next.subject.startsWith("Re:") ? next.subject : `Re: ${next.subject}`;
  const q = await L.queue({ key: next.next_key, contact_id: next.contact_id, company_id: next.company_id, sequence: "cold", step: next.step, subject, body, scheduled_for: next.send_after });
  if (q.ok) await L.approve(next.next_key, "auto");
  else await L.log("a2", next.company_id, "followup_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
  return q;
}

export async function sendDue(budgetMs = 200000) {
  const t0 = Date.now();
  const e = await getEvent();
  const out: string[] = [];
  if (!(await G.connectedEmail())) return { sent: 0, notes: ["Gmail not connected: approved emails wait in the queue (draft mode)."] };
  let sent = 0;
  for (const m of await L.due()) {
    if (Date.now() - t0 > budgetMs) { out.push("time budget reached, rest next run"); break; }
    let c = await L.claim(m.key);
    if (c.startsWith("WAIT:")) {
      const w = Number(c.slice(5));
      if (Date.now() - t0 + w * 1000 > budgetMs) { out.push(`spacing: next send in ${w}s, next run`); break; }
      await new Promise((r) => setTimeout(r, w * 1000));
      c = await L.claim(m.key);
    }
    if (c.startsWith("CAP:")) { out.push(c); break; }
    if (c === "CLAIMED" && m.sequence === "cold" && !(await getSetting("organiser_permission", ""))) {
      const d0 = await db();
      await d0.q(`UPDATE messages SET status='approved', claimed_at=NULL WHERE key=$1`, [m.key]);
      out.push("Cold emails are held: record the organisers' written permission in Settings first.");
      break;
    }
    if (c !== "CLAIMED") { out.push(`${m.key}: ${c}`); continue; }
    try {
      const prev = await lastSent(m.contact_id);
      const r = await G.send({ to: m.to_email, subject: m.subject, body: m.body, threadId: prev?.thread_id || null, inReplyTo: prev?.rfc_message_id || null, fromName: e?.sender?.name });
      const s = await L.markSent(m.key, r.threadId, r.id, r.rfcId);
      sent++;
      if (s.next) {
        const d = await db();
        const cur = (await d.q(`SELECT * FROM messages WHERE key=$1`, [m.key]))[0];
        try { await draftFollowUp({ next_key: s.next.key, contact_id: m.contact_id, company_id: m.company_id, step: num(cur.step) + 1, subject: cur.subject, send_after: s.next.after }); }
        catch (err: any) { out.push(`follow-up draft failed, reconcile will retry: ${err.message}`); }
      }
    } catch (err: any) {
      await L.markFailed(m.key);
      out.push(`${m.key}: send failed: ${err.message}`);
    }
  }
  return { sent, notes: out };
}

async function handleInbound(co: any, ct: any, gmailId: string, text: string) {
  const e = await needEvent();
  const c = await A.classify(text);
  const res = await L.recordReply({ gmail_id: gmailId, contact_id: ct.id, company_id: co.id, classification: c.label as any, summary: c.summary, offer_inr: c.offer_inr, resume_after: c.return_date });
  if (res === "DUPLICATE") return null;
  await L.log("a2", co.id, "reply", `${c.label}: ${c.summary}`);
  if (c.suspicious) await L.addException(co.id, "suspicious_email", `Email from ${ct.full_name} contains instructions aimed at an AI or asks for other companies' data. Read it yourself.`, "Do not act on it automatically.");
  if (["interested", "meeting", "need_info", "referral"].includes(c.label)) {
    if (c.offer_inr && c.offer_inr < (e.floor_inr || 0)) {
      const k = await A.counterOffer(e, co, c.offer_inr, c.summary, firstName(ct.full_name));
      await L.addException(co.id, "below_floor", `${co.name} offered INR ${c.offer_inr}, below the floor of INR ${e.floor_inr}.`, k.recommendation, k.subject, A.withSignature(k.body, e));
    } else {
      const r = await A.draftReply(e, co, c.summary, c.label, firstName(ct.full_name));
      const q = await L.queue({ key: `${ct.id}:reply:${gmailId}`, contact_id: ct.id, company_id: co.id, sequence: "reply", step: 1, subject: r.subject, body: A.withSignature(r.body, e) });
      if (!q.ok) await L.log("a2", co.id, "reply_draft_refused", `${q.reason} ${(q.problems || []).join("; ")}`);
    }
  }
  return c;
}

export async function checkReplies() {
  const me = (await G.connectedEmail()).toLowerCase();
  if (!me) return { checked: 0, found: 0, notes: ["Gmail not connected"] };
  const d = await db();
  const threads = await d.q(`SELECT DISTINCT m.thread_id, m.contact_id, m.company_id FROM messages m WHERE m.status='sent' AND m.thread_id IS NOT NULL`);
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
      await handleInbound(co, ct, m.id, (looksBounce ? "[delivery failure notice]\n" : "") + `From: ${m.from}\nSubject: ${m.subject}\n\n${m.text}`);
      found++;
    }
  }
  return { checked: threads.length, found };
}

export async function simulateReply(companyId: string, text: string) {
  const d = await db();
  const co = (await d.q(`SELECT * FROM companies WHERE id=$1`, [companyId]))[0];
  const ct = (await d.q(`SELECT * FROM contacts WHERE company_id=$1 ORDER BY is_primary DESC LIMIT 1`, [companyId]))[0];
  if (!co || !ct) throw new Error("Company has no contact yet. Analyze it first.");
  return handleInbound(co, ct, `sim-${uid()}`, `[SIMULATED REPLY FOR DEMO]\n${text}`);
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

export async function cycle() {
  const out: any = {};
  out.reconcile = await reconcile();
  out.replies = await checkReplies().catch((e) => ({ error: e.message }));
  out.send = await sendDue(150000);
  await L.log("cycle", null, "cycle", JSON.stringify({ sent: out.send.sent, replies: out.replies.found ?? 0 }));
  return out;
}

export async function makeMou(companyId: string, deal: any) {
  const e = await needEvent();
  const d = await db();
  const co = (await d.q(`SELECT * FROM companies WHERE id=$1`, [companyId]))[0];
  if (!co) throw new Error("Unknown company");
  const md = await A.mou(e, co, deal);
  await d.q(`INSERT INTO deals (company_id, tier, cash_inr, in_kind, deliverables, mou, status, updated_at) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)
     ON CONFLICT (company_id) DO UPDATE SET tier=excluded.tier, cash_inr=excluded.cash_inr, in_kind=excluded.in_kind, deliverables=excluded.deliverables, mou=excluded.mou, status='draft', updated_at=excluded.updated_at`,
    [companyId, deal.tier, num(deal.cash_inr), deal.in_kind || "", deal.deliverables || "", md, nowIso()]);
  if (num(deal.cash_inr) && num(deal.cash_inr) < e.floor_inr)
    await L.addException(companyId, "below_floor_mou", `MOU cash INR ${deal.cash_inr} is below the floor INR ${e.floor_inr}.`, "Approve only if the trade is worth it.");
  const st = await L.stageOf(companyId);
  if (st !== "MOU_DRAFTED") await L.setStage(companyId, "MOU_DRAFTED", `MOU for ${deal.tier}`, "a6");
  return md;
}

export async function resolveException(id: string, action: "approve" | "reject", who: string, note = "", subject?: string, body?: string) {
  const d = await db();
  const x = (await d.q(`SELECT * FROM exceptions WHERE id=$1`, [id]))[0];
  if (!x || x.status !== "open") throw new Error("Exception not open");
  const allowed = (await getSetting("approvers", "")).split(",").map((s) => s.trim().toLowerCase());
  if (!allowed.includes((who || "").toLowerCase())) throw new Error("Pick an approver name from Settings.");
  let queued: any = null;
  if (action === "approve" && (body || x.draft_body)) {
    const ct = (await d.q(`SELECT * FROM contacts WHERE company_id=$1 ORDER BY is_primary DESC LIMIT 1`, [x.company_id]))[0];
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
