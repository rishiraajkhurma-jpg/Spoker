import { wrap } from "@/lib/http";
import { db, getSetting, json } from "@/lib/db";
import { getEvent } from "@/lib/flows";
import { hasClaude, hasCrustdata, model, provider, dataSource } from "@/lib/claude";
import { hasGoogleApp, connectedEmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export const GET = wrap(async (req) => {
  const d = await db();
  const since = new URL(req.url).searchParams.get("log_only");
  const log = await d.q(`SELECT * FROM log ORDER BY ts DESC LIMIT 200`);
  if (since) return { log };
  const companies = (await d.q(`SELECT * FROM companies ORDER BY COALESCE(intersection, -1) DESC, name`)).map((c) => ({ ...c, reasons: json(c.reasons, {}), role_map: json(c.role_map, {}), sources: json(c.sources, []) }));
  const contacts = (await d.q(`SELECT * FROM contacts WHERE status <> 'erased'`)).map((c) => ({ ...c, context: json(c.context, []) }));
  const messages = await d.q(`SELECT id, key, contact_id, company_id, to_email, sequence, step, subject, body, gate, status, approved_by, scheduled_for, sent_at, cancel_reason, attempts, created_at FROM messages ORDER BY created_at DESC LIMIT 500`);
  const replies = await d.q(`SELECT * FROM replies ORDER BY received_at DESC LIMIT 200`);
  const exceptions = await d.q(`SELECT * FROM exceptions ORDER BY created_at DESC LIMIT 200`);
  const deals = await d.q(`SELECT * FROM deals`);
  const meetings = (await d.q(`SELECT * FROM meetings ORDER BY created_at DESC`)).map((m) => ({ ...m, digest: json(m.digest, null) }));
  const decks = await d.q(`SELECT id, company_id, created_at FROM decks ORDER BY created_at DESC`);
  return {
    event: await getEvent(), companies, contacts, messages, replies, exceptions, deals, meetings, decks, log,
    settings: {
      approvers: await getSetting("approvers", ""), postal: await getSetting("postal", ""),
      cap_new_per_day: await getSetting("cap_new_per_day", "30"), cap_total_per_day: await getSetting("cap_total_per_day", "60"), spacing_sec: await getSetting("spacing_sec", "60"),
      gmail: await connectedEmail(), googleApp: hasGoogleApp(), claude: hasClaude(), provider: provider(), crustdata: hasCrustdata(), source: dataSource(), model: model(), permission: await getSetting("organiser_permission", ""),
    },
  };
});
