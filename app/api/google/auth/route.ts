// Starts Google OAuth: random one-time state + PKCE verifier, bound to this session, valid 10 minutes.
import { requireUser, randomToken, sha256 } from "@/lib/auth";
import { authUrl, hasGoogleApp } from "@/lib/gmail";

export async function GET(req: Request) {
  const r = await requireUser(req, "admin");
  if (r.res) return r.res;
  if (!hasGoogleApp()) return Response.json({ error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." }, { status: 400 });
  const origin = new URL(req.url).origin;
  const state = randomToken(24), verifier = randomToken(48);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const bind = (await sha256(r.user.session)).slice(0, 24);
  const exp = Date.now() + 10 * 60 * 1000;
  const cookie = `sd_oauth=${state}.${verifier}.${exp}.${bind}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  return new Response(null, { status: 302, headers: { location: authUrl(origin, state, challenge), "set-cookie": cookie } });
}
