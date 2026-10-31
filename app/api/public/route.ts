// Public, read-only views shared with sponsors: a deck (/d/<id>) or an MOU (/m/<share_id>). IDs are random and unguessable.
import { db, json } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind"), id = u.searchParams.get("id") || "";
  if (!/^[a-z0-9]{12,40}$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const d = await db();
  if (kind === "deck") {
    const r = (await d.q(`SELECT json FROM decks WHERE id=$1`, [id]))[0];
    if (!r) return Response.json({ error: "not found" }, { status: 404 });
    const deck: any = json(r.json, {});
    delete deck.talk_track; // internal: never shown to the sponsor
    for (const s of deck.slides || []) delete s.notes;
    return Response.json(deck);
  }
  if (kind === "mou") {
    const r = (await d.q(`SELECT d.mou, d.tier, c.name FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.share_id=$1`, [id]))[0];
    return r ? Response.json({ mou: r.mou, tier: r.tier, company: r.name }) : Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
