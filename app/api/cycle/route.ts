import { guard, isCron } from "@/lib/auth";
import { cycle } from "@/lib/flows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function run(req: Request) {
  if (!isCron(req)) { const g = await guard(req); if (g) return g; }
  try { return Response.json(await cycle(new URL(req.url).origin)); } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
export const GET = run;
export const POST = run;
