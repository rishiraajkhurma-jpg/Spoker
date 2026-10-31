import { guard } from "@/lib/auth";
import { authUrl, hasGoogleApp } from "@/lib/gmail";

export async function GET(req: Request) {
  const g = await guard(req); if (g) return g;
  if (!hasGoogleApp()) return Response.json({ error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." }, { status: 400 });
  const origin = new URL(req.url).origin;
  return Response.redirect(authUrl(origin, "sd"), 302);
}
