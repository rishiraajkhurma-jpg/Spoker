// Decision-maker database as CSV: who, how to reach them, how each detail was checked, and the evidence.
import { guard } from "@/lib/auth";
import { db, json } from "@/lib/db";

export const dynamic = "force-dynamic";
const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const g = await guard(req, "operator"); if (g) return g;
  const d = await db();
  const rows = await d.q(`SELECT ct.*, co.name AS company FROM contacts ct LEFT JOIN companies co ON co.id=ct.company_id WHERE ct.status <> 'erased' ORDER BY co.name`);
  const head = ["Company", "Name", "Designation", "Department", "Role", "Email", "Email verification", "Email type", "Email source", "Phone", "Phone verification", "Phone type", "Phone source", "Relevance /100", "Reason", "Evidence", "Reviewed by", "Discovered", "Last checked", "Status"];
  const lines = [head.map(esc).join(",")];
  for (const r of rows) lines.push([r.company, r.full_name, r.position, r.department, r.is_primary ? "primary" : r.kind || "alternative", r.email, r.email_status, r.email_type, r.email_source, r.phone, r.phone_status, r.phone_type === "switchboard" ? "switchboard (not direct)" : r.phone_type, r.phone_source, r.relevance, r.reason, json<any[]>(r.evidence, []).map((e: any) => `${e.claim} ${e.url}`).join(" | "), r.reviewed_by, r.discovered_at, r.verified_at, r.status].map(esc).join(","));
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=sponsordesk-decision-makers.csv" } });
}
