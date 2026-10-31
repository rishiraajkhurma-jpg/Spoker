import { wrap } from "@/lib/http";
import { db, getSetting, json } from "@/lib/db";
import { getEvent } from "@/lib/flows";
import { hasClaude, hasCrustdata, model, provider } from "@/lib/claude";
import { hasGoogleApp, connectedEmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export const GET = wrap(async () => {
  const d = await db();
  const companies = (await d.q(`SELECT * FROM companies ORDER BY COALESCE(intersection, -1) DESC, name`)).map((c) => ({ ...c, reasons: json(c.reasons, {}), role_map: json(c.role_map, {}) }));
  const contacts = (await d.q(`SELECT * FROM contacts`)).map((c) => ({ ...c, context: json(c.context, []) }));
  const messages = await d.q(`SELECT id, key, contact_id, company_id, to_email, sequence, step, subject, body, gate, status, approved_by, scheduled_for, sent_at, cancel_reason, attempts FROM messages ORDER BY created_at DESC LIMIT 400`);
  const replies = await d.q(`SELECT * FROM replies ORDER BY received_at DESC LIMIT 200`);
  const exceptions = await d.q(`SELECT * FROM exceptions ORDER BY created_at DESC LIMIT 200`);
  const deals = await d.q(`SELECT * FROM deals`);
  const log = await d.q(`SELECT * FROM log ORDER BY ts DESC LIMIT 150`);
  return {
    event: await getEvent(), companies, contacts, messages, replies, exceptions, deals, log,
    settings: {
      approvers: await getSetting("approvers", ""), postal: await getSetting("postal", ""),
      cap_new_per_day: await getSetting("cap_new_per_day", "30"), cap_total_per_day: await getSetting("cap_total_per_day", "60"), spacing_sec: await getSetting("spacing_sec", "60"),
      gmail: await connectedEmail(), googleApp: hasGoogleApp(), claude: hasClaude(), provider: provider(), crustdata: hasCrustdata(), model: model(), permission: await getSetting("organiser_permission", ""),
    },
  };
});
