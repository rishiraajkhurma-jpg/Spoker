// Single-team password gate. The cookie holds a hash of APP_PASSWORD, never the password.
const COOKIE = "sd_auth";

async function hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function token() {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  return hex("sponsordesk:" + pw);
}
function cookieValue(req: Request, name: string) {
  const c = req.headers.get("cookie") || "";
  const m = c.split(/;\s*/).find((p) => p.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
/** Returns a 401 Response if not logged in, otherwise null. */
export async function guard(req: Request): Promise<Response | null> {
  const t = await token();
  if (!t) return Response.json({ error: "APP_PASSWORD is not set on the server. Add it in Vercel environment variables." }, { status: 500 });
  if (cookieValue(req, COOKIE) !== t) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
export async function loginCookie(password: string): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  if (!pw || password !== pw) return null;
  return `${COOKIE}=${await token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}
export function isCron(req: Request) {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get("authorization") === `Bearer ${s}`;
}
