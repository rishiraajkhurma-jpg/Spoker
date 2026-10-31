import { wrap } from "@/lib/http";
import { db, nowIso, setSetting } from "@/lib/db";
import { log } from "@/lib/ledger";

export const POST = wrap(async (req) => {
  const { profile } = await req.json();
  if (!profile?.name || !profile?.sender?.name || !profile?.postal_address) throw new Error("Event name, sender name and postal address are required.");
  if (!Array.isArray(profile.tiers) || !profile.tiers.length) throw new Error("Add at least one tier.");
  const d = await db();
  await d.q(`INSERT INTO events (id, profile, updated_at) VALUES ('current', $1, $2) ON CONFLICT (id) DO UPDATE SET profile=excluded.profile, updated_at=excluded.updated_at`, [JSON.stringify(profile), nowIso()]);
  const pin = String(profile.postal_address).match(/\b\d{6}\b/);
  await setSetting("postal", pin ? pin[0] : String(profile.postal_address));
  await log("manager", null, "event_saved", profile.name);
  return { ok: true };
});
