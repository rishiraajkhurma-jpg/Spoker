// Authentication: per-user accounts with roles, server-side sessions (expiring, revocable), login rate limiting, CSRF origin check.
// Bootstrap: while no user exists, the first login with APP_PASSWORD creates the admin account for that email.
import { db, nowIso, uid } from "./db";

export type Role = "admin" | "approver" | "operator" | "readonly";
export type User = { id: string; email: string; name: string; role: Role; session: string };
export const RANK: Record<Role, number> = { readonly: 0, operator: 1, approver: 2, admin: 3 };
const COOKIE = "sd_session";
const TTL_MS = 7 * 24 * 3600 * 1000;
const enc = new TextEncoder();

const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
export async function sha256(s: string) {
  return Buffer.from(await crypto.subtle.digest("SHA-256", enc.encode(s))).toString("hex");
}
export function randomToken(bytes = 32) { return b64u(crypto.getRandomValues(new Uint8Array(bytes))); }
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ---- passwords (PBKDF2-SHA256, 210k iterations) ----
const ITER = 210000;
async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, k, 256));
}
export async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await pbkdf2(pw, salt, ITER))}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, it, s, h] = String(stored || "").split("$");
  if (alg !== "pbkdf2" || !s || !h) return false;
  const got = b64u(await pbkdf2(pw, new Uint8Array(Buffer.from(s, "base64url")), Number(it)));
  return safeEqual(got, h);
}

function cookieValue(req: Request, name: string) {
  const c = req.headers.get("cookie") || "";
  const m = c.split(/;\s*/).find((p) => p.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

/** The signed-in user, or null. Sessions are stored as sha256(token); expired, revoked or disabled users get null. */
export async function currentUser(req: Request): Promise<User | null> {
  const tok = cookieValue(req, COOKIE);
  if (!tok) return null;
  const d = await db();
  const sid = await sha256(tok);
  const r = (await d.q(`SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=$1 AND s.revoked_at IS NULL AND COALESCE(u.disabled,0)=0`, [sid]))[0];
  if (!r || new Date(r.expires_at).getTime() < Date.now()) return null;
  return { id: r.id, email: r.email, name: r.name, role: r.role as Role, session: sid };
}

/** Writes must come from this site (CSRF): Origin, else Referer, must match the request host. */
export function sameOrigin(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const src = req.headers.get("origin") || req.headers.get("referer") || "";
  try { return !!src && new URL(src).host === host; } catch { return false; }
}

/** Returns { user } or { res } (a 401/403 Response). */
export async function requireUser(req: Request, min: Role = "readonly"): Promise<{ user: User; res?: undefined } | { res: Response; user?: undefined }> {
  if (!process.env.APP_PASSWORD && !(await anyUser())) return { res: Response.json({ error: "APP_PASSWORD is not set on the server. Add it in Vercel environment variables." }, { status: 500 }) };
  if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return { res: Response.json({ error: "cross-site request refused" }, { status: 403 }) };
  const user = await currentUser(req);
  if (!user) return { res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (RANK[user.role] < RANK[min]) return { res: Response.json({ error: `Your role (${user.role}) cannot do this. Ask an admin.` }, { status: 403 }) };
  return { user };
}
/** Backwards-compatible guard: Response on failure, null when signed in. */
export async function guard(req: Request, min: Role = "readonly"): Promise<Response | null> {
  const r = await requireUser(req, min);
  return r.res || null;
}

async function anyUser() {
  const d = await db();
  return (await d.q(`SELECT 1 FROM users LIMIT 1`)).length > 0;
}

export async function login(email: string, password: string, ip: string): Promise<{ cookie?: string; error?: string; status?: number }> {
  const d = await db();
  const em = String(email || "").trim().toLowerCase();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const fails = (await d.q(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip=$1 AND ok=0 AND at >= $2`, [ip, since]))[0];
  if (Number(fails?.n || 0) >= 8) return { error: "Too many failed attempts. Wait 15 minutes.", status: 429 };
  let user = em ? (await d.q(`SELECT * FROM users WHERE lower(email)=$1 AND COALESCE(disabled,0)=0`, [em]))[0] : null;
  let ok = false;
  if (user) ok = await verifyPassword(password, user.pw_hash);
  else if (!(await anyUser()) && process.env.APP_PASSWORD && em && safeEqual(password, process.env.APP_PASSWORD)) {
    // First run: create the admin account.
    const name = em.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    user = { id: uid(), email: em, name, role: "admin" };
    await d.q(`INSERT INTO users (id, email, name, role, pw_hash, disabled, created_at) VALUES ($1,$2,$3,'admin',$4,0,$5)`, [user.id, em, name, await hashPassword(password), nowIso()]);
    ok = true;
  }
  await d.q(`INSERT INTO login_attempts (id, ip, ok, at) VALUES ($1,$2,$3,$4)`, [uid(), ip, ok ? 1 : 0, nowIso()]);
  if (!ok || !user) return { error: (await anyUser()) ? "Wrong email or password" : "First sign-in: use your email and the team password (APP_PASSWORD).", status: 401 };
  const tok = randomToken();
  await d.q(`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)`, [await sha256(tok), user.id, nowIso(), new Date(Date.now() + TTL_MS).toISOString()]);
  return { cookie: `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}` };
}
export async function logout(req: Request) {
  const u = await currentUser(req);
  if (u) { const d = await db(); await d.q(`UPDATE sessions SET revoked_at=$1 WHERE id=$2`, [nowIso(), u.session]); }
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function revokeAll(userId: string) {
  const d = await db();
  await d.q(`UPDATE sessions SET revoked_at=$1 WHERE user_id=$2 AND revoked_at IS NULL`, [nowIso(), userId]);
}

export function isCron(req: Request) {
  const s = process.env.CRON_SECRET;
  return !!s && safeEqual(req.headers.get("authorization") || "", `Bearer ${s}`);
}

// ---- secrets at rest (Google refresh token): AES-GCM with a key from TOKEN_KEY or APP_PASSWORD ----
async function aesKey() {
  const secret = process.env.TOKEN_KEY || process.env.APP_PASSWORD || "";
  if (!secret) return null;
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode("sponsordesk-token:" + secret)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealSecret(plain: string) {
  const k = await aesKey(); if (!k) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `enc:${b64u(iv)}:${b64u(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(plain)))}`;
}
export async function openSecret(stored: string) {
  if (!stored.startsWith("enc:")) return stored; // stored before encryption existed
  const k = await aesKey(); if (!k) throw new Error("TOKEN_KEY/APP_PASSWORD missing: cannot read the Google token. Reconnect Google.");
  const [, iv, ct] = stored.split(":");
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(Buffer.from(iv, "base64url")) }, k, Buffer.from(ct, "base64url"))); }
  catch { throw new Error("The stored Google token cannot be read (the server secret changed). Reconnect Google in Settings."); }
}
