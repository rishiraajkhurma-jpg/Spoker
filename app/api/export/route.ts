// Contact database as CSV (the A2 database: name, email, phone, company, position, LinkedIn, context, one-liner).
import { guard } from "@/lib/auth";
import { db, json } from "@/lib/db";

export const dynamic = "force-dynamic";
const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const g = await guard(req); if (g) return g;
  const d = await db();
  const rows = await d.q(`SELECT ct.*, co.name AS company FROM contacts ct LEFT JOIN companies co ON co.id=ct.company_id WHERE ct.status <> 'erased' ORDER BY co.name`);
  const head = ["Name", "Email", "Email status", "Phone", "Company", "Position", "LinkedIn URL", "LinkedIn context", "One-liner", "IITB alum", "Warm path", "Source", "Status"];
  const lines = [head.map(esc).join(",")];
  for (const r of rows) lines.push([r.full_name, r.email, r.email_status, r.phone, r.company, r.position, r.linkedin_url, json<string[]>(r.context, []).join(" | "), r.one_liner, r.iitb_alum, r.warm_path, r.source, r.status].map(esc).join(","));
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=sponsordesk-contacts.csv" } });
}
