import { isCron, requireUser } from "@/lib/auth";
import { cycle } from "@/lib/flows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function run(req: Request) {
  try { return Response.json(await cycle(new URL(req.url).origin)); } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
// GET is only for Vercel Cron (Bearer CRON_SECRET): a link click can never trigger sending.
export async function GET(req: Request) {
  if (!isCron(req)) return Response.json({ error: "cron only; use POST from the app" }, { status: 405 });
  return run(req);
}
// POST: a signed-in approver, same-origin.
export async function POST(req: Request) {
  const r = await requireUser(req, "approver");
  if (r.res) return r.res;
  return run(req);
}
