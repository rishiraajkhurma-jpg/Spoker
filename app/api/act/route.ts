import { wrap } from "@/lib/http";
import { db, setSetting, nowIso } from "@/lib/db";
import * as L from "@/lib/ledger";
import * as F from "@/lib/flows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const POST = wrap(async (req) => {
  const b = await req.json();
  switch (b.op) {
    case "discover": return F.runDiscover(Number(b.count || 10));
    case "analyze": return F.runAnalyze(String(b.company_id));
    case "add_company": {
      const d = await db();
      const id = String(b.domain || b.name).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await d.q(`INSERT INTO companies (id, name, domain, stage, stage_reason, why_now, updated_at) VALUES ($1,$2,$3,'PROSPECT','added by hand',$4,$5) ON CONFLICT (id) DO NOTHING`, [id, b.name, b.domain || "", b.note || "", nowIso()]);
      await L.log("manager", id, "add_company", b.note || "");
      return { ok: true, id };
    }
    case "edit": return L.editDraft(b.key, b.subject, b.body);
    case "approve": return L.approve(b.key, b.approver);
    case "approve_many": {
      const out: any[] = [];
      for (const k of b.keys || []) out.push({ key: k, ...(await L.approve(k, b.approver)) });
      return { results: out };
    }
    case "reject": await L.reject(b.key, b.approver || "manager"); return { ok: true };
    case "send": return F.sendDue(200000);
    case "replies": return F.checkReplies();
    case "simulate": return { result: await F.simulateReply(b.company_id, String(b.text || "")) };
    case "reconcile": return F.reconcile();
    case "resolve": return F.resolveException(b.id, b.action, b.approver, b.note || "", b.subject, b.body);
    case "mou": return { mou: await F.makeMou(b.company_id, b.deal || {}) };
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
