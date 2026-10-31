import { wrap } from "@/lib/http";
import { db, setSetting, nowIso } from "@/lib/db";
import * as L from "@/lib/ledger";
import * as F from "@/lib/flows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const POST = wrap(async (req) => {
  const b = await req.json();
  const origin = new URL(req.url).origin;
  switch (b.op) {
    // A0
    case "brief": return F.runBrief(String(b.line || ""), b.sender || {});
    case "lock_floor": return F.lockFloor(Number(b.floor), b.approver);
    // A1 / A2
    case "discover": return F.runDiscover(Number(b.count || 8));
    case "analyze": return F.runAnalyze(String(b.company_id));
    case "add_company": {
      const d = await db();
      const id = String(b.domain || b.name).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await d.q(`INSERT INTO companies (id, name, domain, stage, stage_reason, why_now, updated_at) VALUES ($1,$2,$3,'PROSPECT','added by hand',$4,$5) ON CONFLICT (id) DO NOTHING`, [id, b.name, b.domain || "", b.note || "", nowIso()]);
      await L.log("manager", id, "add_company", b.note || "");
      return { ok: true, id };
    }
    case "set_email": return F.setContactEmail(String(b.contact_id), String(b.email || ""));
    case "linkedin_status": {
      const d = await db();
      await d.q(`UPDATE contacts SET linkedin_status=$1 WHERE id=$2`, [b.status, b.contact_id]);
      await L.log("manager", b.company_id || null, "linkedin", `${b.status}: ${b.contact_id}`);
      return { ok: true };
    }
    // Email agent / approvals
    case "edit": return L.editDraft(b.key, b.subject, b.body);
    case "approve": return L.approve(b.key, b.approver);
    case "approve_many": {
      const out: any[] = [];
      for (const k of b.keys || []) out.push({ key: k, ...(await L.approve(k, b.approver)) });
      return { results: out };
    }
    case "reject": await L.reject(b.key, b.approver || "manager"); return { ok: true };
    case "send": return F.sendDue(200000);
    case "replies": return F.checkReplies(origin);
    case "simulate": return { result: await F.simulateReply(b.company_id, String(b.text || ""), origin) };
    case "reconcile": return F.reconcile();
    case "resolve": return F.resolveException(b.id, b.action, b.approver, b.note || "", b.subject, b.body);
    // A3
    case "schedule": return F.scheduleMeeting(String(b.company_id), String(b.template || "first_call"), (b.slots || []).filter(Boolean));
    case "confirm_meeting": return F.confirmMeeting(String(b.company_id), String(b.start), Number(b.minutes || 30), b.approver, origin);
    // A4
    case "deck": return F.buildDeck(String(b.company_id));
    // A5
    case "gemini_notes": return F.findGeminiNotes(String(b.company_id));
    case "notes": return F.ingestNotes(String(b.company_id), String(b.notes || ""));
    // A6
    case "mou": return F.makeMou(b.company_id, b.deal || {});
    case "send_mou": return F.sendMou(b.company_id, origin);
    // A7
    case "nurture": return F.nurture(String(b.news || ""));
    // misc
    case "stage": await L.setStage(b.company_id, b.stage, b.reason || "manual", "manager"); return { ok: true };
    case "settings": {
      for (const k of ["approvers", "cap_new_per_day", "cap_total_per_day", "spacing_sec", "organiser_permission"]) if (b[k] !== undefined) await setSetting(k, String(b[k]));
      return { ok: true };
    }
    case "suppress": await L.suppress(b.email, "manual"); return { ok: true };
    case "forget": return { erased: await L.forget(b.email) };
    default: throw new Error("unknown op " + b.op);
  }
});
