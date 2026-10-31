import { requireUser, Role, RANK, hashPassword, revokeAll } from "@/lib/auth";
import { db, setSetting, nowIso, uid } from "@/lib/db";
import * as L from "@/lib/ledger";
import * as F from "@/lib/flows";
import * as G from "@/lib/gmail";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Minimum role per operation. Approver identity always comes from the signed-in user, never from the request body.
const ROLE: Record<string, Role> = {
  brief: "operator", discover: "operator", analyze: "operator", add_company: "operator", set_email: "operator", rediscover: "operator",
  edit: "operator", simulate: "operator", schedule: "operator", deck: "operator", gemini_notes: "operator", notes: "operator",
  mou: "operator", send_mou: "operator", nurture: "operator", replies: "operator", reconcile: "operator", contact_reviewed: "operator", set_primary: "operator", prepare_outreach: "operator",
  lock_floor: "approver", approve: "approver", approve_many: "approver", reject: "approver", send: "approver", resolve: "approver",
  confirm_meeting: "approver", stage: "approver", suppress: "approver", delivery: "approver",
  settings: "admin", reset: "admin", forget: "admin", user_add: "admin", user_update: "admin", sessions_revoke: "admin", google_disconnect: "admin",
};
const STAGES = new Set(["PROSPECT", "QUALIFIED", "CONTACT_READY", "CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2", "REPLIED", "MEETING_REQUESTED", "MEETING_SCHEDULED", "MEETING_DONE", "NEGOTIATING", "MOU_DRAFTED", "MOU_SENT", "MOU_SIGNED", "PO_RECEIVED", "INVOICED", "PAID", "INKIND_CONFIRMED", "NURTURE", "DELIVERED", "REPORTED", "RENEWAL", "NO_RESPONSE", "LOST", "OPTED_OUT", "BOUNCED", "DISQUALIFIED", "PARKED"]);
const ROLES = new Set(["admin", "approver", "operator", "readonly"]);

export async function POST(req: Request) {
  let b: any;
  try { b = await req.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const need = ROLE[String(b?.op)];
  if (!need) return Response.json({ error: "unknown op " + b?.op }, { status: 400 });
  const r = await requireUser(req, need);
  if (r.res) return r.res;
  const me = r.user;
  const origin = new URL(req.url).origin;
  try {
    return Response.json((await run(b, me, origin)) ?? { ok: true });
  } catch (e: any) {
    console.error(e);
    return Response.json({ error: e?.message || String(e) }, { status: 400 });
  }
}

async function run(b: any, me: { id: string; name: string; role: Role }, origin: string) {
  const who = me.name;
  switch (b.op) {
    // A0
    case "brief": return F.runBrief(String(b.line || ""), b.sender || {}, String(b.answers || ""), b.dry === true);
    case "lock_floor": {
      const floor = Number(b.floor);
      if (!Number.isFinite(floor) || floor <= 0) throw new Error("The floor must be a positive amount in rupees.");
      return F.lockFloor(floor, who);
    }
    // A1 / A2
    case "discover": return F.runDiscover(Math.max(1, Math.min(25, Number(b.count || 8))));
    case "analyze": case "rediscover": return F.runAnalyze(String(b.company_id));
    case "add_company": {
      const name = String(b.name || "").trim();
      if (!name) throw new Error("Company name is required.");
      const d = await db();
      const id = String(b.domain || name).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      await d.q(`INSERT INTO companies (id, name, domain, stage, stage_reason, why_now, updated_at) VALUES ($1,$2,$3,'PROSPECT','added by hand',$4,$5) ON CONFLICT (id) DO NOTHING`, [id, name, String(b.domain || ""), String(b.note || ""), nowIso()]);
      await L.log(who, id, "add_company", String(b.note || ""));
      return { ok: true, id };
    }
    case "set_email": return F.setContactEmail(String(b.contact_id), String(b.email || ""));
    case "contact_reviewed": return F.markContactReviewed(String(b.contact_id), who);
    case "set_primary": return F.setPrimaryContact(String(b.contact_id), who);
    case "prepare_outreach": return F.queueOffer(String(b.company_id));
    // Email agent / approvals
    case "edit": return L.editDraft(String(b.key), String(b.subject || ""), String(b.body || ""));
    case "approve": return L.approve(String(b.key), who, true);
    case "approve_many": {
      const out: any[] = [];
      for (const k of (Array.isArray(b.keys) ? b.keys : []).slice(0, 100)) out.push({ key: k, ...(await L.approve(String(k), who, true)) });
      return { results: out };
    }
    case "reject": await L.reject(String(b.key), who); return { ok: true };
    case "send": return F.sendDue(200000);
    case "delivery": return L.resolveUnknown(String(b.key), b.outcome === "sent" ? "sent" : "resend", who);
    case "replies": return F.checkReplies(origin);
    case "simulate": return { result: await F.simulateReply(String(b.company_id), String(b.text || ""), origin) };
    case "reconcile": return F.reconcile();
    case "resolve": return F.resolveException(String(b.id), b.action === "approve" ? "approve" : "reject", who, String(b.note || ""), b.subject, b.body, true);
    // A3
    case "schedule": return F.scheduleMeeting(String(b.company_id), String(b.template || "first_call"), (Array.isArray(b.slots) ? b.slots : []).filter(Boolean).map(String));
    case "confirm_meeting": {
      const minutes = Number(b.minutes || 30);
      if (!(minutes >= 10 && minutes <= 240)) throw new Error("Meeting length must be between 10 and 240 minutes.");
      return F.confirmMeeting(String(b.company_id), String(b.start), minutes, who, origin, true);
    }
    // A4
    case "deck": return F.buildDeck(String(b.company_id));
    // A5
    case "gemini_notes": return F.findGeminiNotes(String(b.company_id));
    case "notes": return F.ingestNotes(String(b.company_id), String(b.notes || ""));
    // A6
    case "mou": {
      const deal = b.deal || {};
      const cash = Number(deal.cash_inr || 0);
      if (!String(deal.tier || "").trim()) throw new Error("Pick the tier for the MOU.");
      if (!Number.isFinite(cash) || cash < 0) throw new Error("Cash must be zero or a positive amount.");
      return F.makeMou(String(b.company_id), { ...deal, cash_inr: cash });
    }
    case "send_mou": return F.sendMou(String(b.company_id), origin);
    // A7
    case "nurture": return F.nurture(String(b.news || ""));
    // misc
    case "stage": {
      const st = String(b.stage || "");
      if (!STAGES.has(st)) throw new Error("Unknown stage " + st);
      await L.setStage(String(b.company_id), st, String(b.reason || "manual"), who); return { ok: true };
    }
    case "settings": {
      for (const k of ["cap_new_per_day", "cap_total_per_day", "spacing_sec"]) if (b[k] !== undefined) {
        const n = Number(b[k]); if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error(`${k} must be a whole number`);
        await setSetting(k, String(n));
      }
      if (b.organiser_permission !== undefined) await setSetting("organiser_permission", String(b.organiser_permission).slice(0, 500));
      await L.log(who, null, "settings", "updated");
      return { ok: true };
    }
    case "reset": {
      if (b.confirm !== "RESET") throw new Error("Type RESET to confirm");
      const d = await db();
      for (const tb of ["companies", "contacts", "messages", "replies", "exceptions", "deals", "meetings", "decks", "log", "events", "send_budget"]) await d.q(`DELETE FROM ${tb}`);
      await L.log(who, null, "reset", "Desk cleared");
      return { ok: true };
    }
    case "suppress": await L.suppress(String(b.email || ""), "manual"); await L.log(who, null, "suppress", "address suppressed"); return { ok: true };
    case "forget": return { erased: await L.forget(String(b.email || "")) };
    case "google_disconnect": await G.disconnect(); await L.log(who, null, "gmail_disconnected", ""); return { ok: true };
    // users
    case "user_add": {
      const email = String(b.email || "").trim().toLowerCase(), name = String(b.name || "").trim(), role = String(b.role || "operator");
      if (!G.SAFE_EMAIL.test(email) || !name) throw new Error("Email and name are required.");
      if (!ROLES.has(role)) throw new Error("Unknown role");
      if (String(b.password || "").length < 10) throw new Error("Give a temporary password of at least 10 characters.");
      const d = await db();
      await d.q(`INSERT INTO users (id, email, name, role, pw_hash, disabled, created_at) VALUES ($1,$2,$3,$4,$5,0,$6)`, [uid(), email, name, role, await hashPassword(String(b.password)), nowIso()]);
      await L.log(who, null, "user_added", `${name} (${role})`);
      return { ok: true };
    }
    case "user_update": {
      const d = await db();
      const u = (await d.q(`SELECT * FROM users WHERE id=$1`, [String(b.id)]))[0];
      if (!u) throw new Error("Unknown user");
      if (u.id === me.id && (b.disabled || (b.role && b.role !== "admin"))) throw new Error("You cannot remove your own admin access.");
      if (b.role) { if (!ROLES.has(b.role)) throw new Error("Unknown role"); await d.q(`UPDATE users SET role=$1 WHERE id=$2`, [b.role, u.id]); }
      if (b.disabled !== undefined) { await d.q(`UPDATE users SET disabled=$1 WHERE id=$2`, [b.disabled ? 1 : 0, u.id]); if (b.disabled) await revokeAll(u.id); }
      if (b.password) { if (String(b.password).length < 10) throw new Error("At least 10 characters."); await d.q(`UPDATE users SET pw_hash=$1 WHERE id=$2`, [await hashPassword(String(b.password)), u.id]); await revokeAll(u.id); }
      await L.log(who, null, "user_updated", u.name);
      return { ok: true };
    }
    case "sessions_revoke": await revokeAll(String(b.user_id || me.id)); return { ok: true };
  }
  void RANK;
  throw new Error("unknown op " + b.op);
}
