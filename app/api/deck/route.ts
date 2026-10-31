// Full deck with speaker notes and talk track, for the team only.
import { guard } from "@/lib/auth";
import { db, json } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(req); if (g) return g;
  const id = new URL(req.url).searchParams.get("id") || "";
  const d = await db();
  const r = (await d.q(`SELECT json FROM decks WHERE id=$1`, [id]))[0];
  return r ? Response.json(json(r.json, {})) : Response.json({ error: "not found" }, { status: 404 });
}
