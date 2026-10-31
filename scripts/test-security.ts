// Security and decision-maker tests against the real route handlers. node:sqlite stands in for Postgres; network is mocked.
import { setDB, db, nowIso } from "../lib/db";
import * as C from "../lib/contacts";
const { DatabaseSync } = require("node:sqlite");
const sq = new DatabaseSync(":memory:");
setDB({ q: async (text: string, params: any[] = []) => { const t = text.replace(/\$(\d+)/g, "?$1"); const st = sq.prepare(t); const ps = params.map((p) => (p === undefined ? null : p)); if (/^\s*(SELECT|WITH)/i.test(t) || /RETURNING/i.test(t)) return st.all(...ps); st.run(...ps); return []; } });
process.env.APP_PASSWORD = "team-secret-123"; process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "cs"; process.env.CRON_SECRET = "cron-xyz";
delete process.env.OPENROUTER_API_KEY; delete process.env.KIMI_K3; delete process.env.ANTHROPIC_API_KEY;
const pages: Record<string, string> = { "https://acme.in/contact": "Write to partnerships@acme.in or call +91 22 4000 1234" };
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  if (pages[u] !== undefined) return { ok: true, status: 200, text: async () => pages[u] };
  if (u.includes("oauth2.googleapis.com/token")) return { ok: true, status: 200, json: async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 }) };
  if (u.includes("gmail.googleapis.com") && u.endsWith("/profile")) return { ok: true, status: 200, json: async () => ({ emailAddress: "me@x.in" }) };
  return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
};
const H = "sponsordesk.test";
const req = (path: string, o: { method?: string; body?: any; cookie?: string; origin?: string | null; auth?: string } = {}) => {
  const h: Record<string, string> = { host: H, "content-type": "application/json", "x-forwarded-for": "1.2.3.4" };
  if (o.cookie) h.cookie = o.cookie; if (o.origin !== null) h.origin = o.origin ?? `https://${H}`; if (o.auth) h.authorization = o.auth;
  return new Request(`https://${H}${path}`, { method: o.method || (o.body ? "POST" : "GET"), headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
};
const cookieOf = (r: Response) => (r.headers.get("set-cookie") || "").split(";")[0];
let fails = 0; const eq = (n: string, g: any, w: any) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`); };

(async () => {
  const { POST: login } = await import("../app/api/login/route");
  const { POST: logout } = await import("../app/api/logout/route");
  const { POST: act } = await import("../app/api/act/route");
  const { GET: state } = await import("../app/api/state/route");
  const { GET: cycleGet } = await import("../app/api/cycle/route");
  const { GET: gAuth } = await import("../app/api/google/auth/route");
  const { GET: gCb } = await import("../app/api/google/callback/route");
  const d = await db();

  // --- authentication
  eq("unauthenticated API refused", (await state(req("/api/state"))).status, 401);
  eq("first login needs the team password", (await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "nope" } }))).status, 401);
  const r1 = await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "team-secret-123" } }));
  const admin = cookieOf(r1);
  eq("first login creates the admin", [r1.status, (await d.q(`SELECT role FROM users`))[0].role], [200, "admin"]);
  eq("session cookie is random, not a password hash", /^sd_session=[A-Za-z0-9_-]{40,}$/.test(admin), true);
  eq("signed-in state works", (await state(req("/api/state", { cookie: admin }))).status, 200);
  eq("invalid session refused", (await state(req("/api/state", { cookie: "sd_session=forged" }))).status, 401);
  // --- CSRF
  eq("cross-site POST refused", (await act(req("/api/act", { cookie: admin, origin: "https://evil.example", body: { op: "settings", spacing_sec: 1 } }))).status, 403);
  eq("POST without origin refused", (await act(req("/api/act", { cookie: admin, origin: null, body: { op: "settings", spacing_sec: 1 } }))).status, 403);
  // --- roles
  await act(req("/api/act", { cookie: admin, body: { op: "user_add", email: "op@ecell.in", name: "Opi", role: "operator", password: "operator-pass-1" } }));
  const op = cookieOf(await login(req("/api/login", { body: { email: "op@ecell.in", password: "operator-pass-1" } })));
  await d.q(`INSERT INTO companies (id, name, stage, updated_at) VALUES ('co','Co','NEGOTIATING',$1)`, [nowIso()]);
  await d.q(`INSERT INTO contacts (id, company_id, email, full_name, status, is_primary, created_at) VALUES ('c','co','p@co.in','P','active',1,$1)`, [nowIso()]);
  await d.q(`INSERT INTO messages (id, key, contact_id, company_id, to_email, sequence, step, subject, body, body_hash, gate, lint_ok, status, attempts, scheduled_for, created_at) VALUES ('m','k1','c','co','p@co.in','reply',1,'S','B','h','approve',1,'drafted',0,$1,$1)`, [nowIso()]);
  eq("operator cannot approve", (await act(req("/api/act", { cookie: op, body: { op: "approve", key: "k1" } }))).status, 403);
  eq("operator cannot change settings", (await act(req("/api/act", { cookie: op, body: { op: "settings", spacing_sec: 0 } }))).status, 403);
  const ap = await (await act(req("/api/act", { cookie: admin, body: { op: "approve", key: "k1", approver: "Somebody Else" } }))).json();
  eq("forged approver name ignored: approval is the signed-in user", [ap.ok, (await d.q(`SELECT approved_by FROM messages WHERE key='k1'`))[0].approved_by], [true, "Rishi"]);
  eq("invalid floor rejected", (await act(req("/api/act", { cookie: admin, body: { op: "lock_floor", floor: -5 } }))).status, 400);
  eq("unknown stage rejected", (await act(req("/api/act", { cookie: admin, body: { op: "stage", company_id: "co", stage: "HACKED" } }))).status, 400);
  // --- sessions
  await d.q(`UPDATE sessions SET expires_at=$1 WHERE user_id=(SELECT id FROM users WHERE email='op@ecell.in')`, [new Date(Date.now() - 1000).toISOString()]);
  eq("expired session refused", (await state(req("/api/state", { cookie: op }))).status, 401);
  const lo = await logout(req("/api/logout", { method: "POST", cookie: admin }));
  eq("logout revokes the session", [(await state(req("/api/state", { cookie: admin }))).status, /Max-Age=0/.test(lo.headers.get("set-cookie") || "")], [401, true]);
  // --- login rate limit
  for (let i = 0; i < 8; i++) await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "wrong" + i } }));
  eq("login rate limited after 8 failures", (await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "team-secret-123" } }))).status, 429);
  await d.q(`DELETE FROM login_attempts`);
  const admin2 = cookieOf(await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "team-secret-123" } })));
  // --- cron: GET never sends without the cron secret
  eq("GET /api/cycle without cron secret refused", (await cycleGet(req("/api/cycle", { cookie: admin2 }))).status, 405);
  // --- OAuth state
  const start = await gAuth(req("/api/google/auth", { cookie: admin2 }));
  const loc = new URL(start.headers.get("location") || "");
  const st = loc.searchParams.get("state") || "", oc = cookieOf(start);
  eq("state is random and PKCE is used", [st.length >= 30 && st !== "sd", loc.searchParams.get("code_challenge_method")], [true, "S256"]);
  const both = `${admin2}; ${oc}`;
  eq("static state 'sd' refused", (await gCb(req(`/api/google/callback?code=c&state=sd`, { cookie: both }))).headers.get("location")?.includes("invalid"), true);
  const ok = await gCb(req(`/api/google/callback?code=c&state=${st}`, { cookie: both }));
  eq("valid state connects", ok.headers.get("location")?.endsWith("gmail=connected"), true);
  eq("refresh token stored encrypted", String((await d.q(`SELECT v FROM settings WHERE k='gmail_refresh'`))[0].v).startsWith("enc:"), true);
  eq("replayed state refused (cookie cleared)", (await gCb(req(`/api/google/callback?code=c&state=${st}`, { cookie: admin2 }))).headers.get("location")?.includes("invalid"), true);
  const start2 = await gAuth(req("/api/google/auth", { cookie: admin2 }));
  const st2 = new URL(start2.headers.get("location") || "").searchParams.get("state");
  const other = cookieOf(await login(req("/api/login", { body: { email: "rishi@ecell.in", password: "team-secret-123" } })));
  eq("state bound to the session that started it", (await gCb(req(`/api/google/callback?code=c&state=${st2}`, { cookie: `${other}; ${cookieOf(start2)}` }))).headers.get("location")?.includes("invalid"), true);

  // --- decision-maker checks (DNS stubbed: acme.in has mail, nomail.example does not)
  C.setMxResolver(async (dom: string) => { if (dom === "nomail.example") { const e: any = new Error("x"); e.code = "ENODATA"; throw e; } return [{ exchange: "mx." + dom }]; });
  eq("domain without a mail server -> UNVERIFIED", (await C.checkEmail({ email: "a@nomail.example", sourceUrl: "https://acme.in/contact" })).status, "UNVERIFIED");
  const e1 = await C.checkEmail({ email: "partnerships@acme.in", fullName: "Partnerships team", companyDomain: "acme.in", sourceUrl: "https://acme.in/contact" });
  eq("departmental email published on the page -> VERIFIED, departmental", [e1.status, e1.type], ["VERIFIED", "departmental"]);
  eq("invalid email", (await C.checkEmail({ email: "priya@@acme" })).status, "UNVERIFIED");
  eq("no email -> UNAVAILABLE", (await C.checkEmail({ email: "" })).status, "UNAVAILABLE");
  eq("left the company -> OUTDATED", (await C.checkEmail({ email: "a.b@acme.in", leftCompany: true })).status, "OUTDATED");
  eq("domain matches + source page unreachable -> CORROBORATED", (await C.checkEmail({ email: "priya.shah@acme.in", fullName: "Priya Shah", companyDomain: "acme.in", sourceUrl: "https://acme.in/team" })).status, "CORROBORATED");
  eq("email without a source stays UNVERIFIED", (await C.checkEmail({ email: "priya.shah@acme.in", fullName: "Priya Shah", companyDomain: "acme.in" })).status, "UNVERIFIED");
  eq("email not on the cited page -> UNVERIFIED", (await C.checkEmail({ email: "ceo@acme.in", companyDomain: "acme.in", sourceUrl: "https://acme.in/contact" })).status, "UNVERIFIED");
  const p1 = await C.checkPhone({ phone: "022 4000 1234", type: "direct", switchboard: "+91 22 4000 1234", sourceUrl: "https://acme.in/contact", companyDomain: "acme.in" });
  eq("switchboard never shown as direct", [p1.type, p1.normalized, p1.status], ["switchboard", "+912240001234", "VERIFIED"]);
  eq("invalid phone", (await C.checkPhone({ phone: "12" })).status, "UNVERIFIED");
  eq("personal mobile from elsewhere not stored", [(await C.checkPhone({ phone: "98200 12345", type: "direct", sourceUrl: "https://randomsite.example/x", companyDomain: "acme.in" })).normalized], [""]);
  eq("E.164 normalisation", [C.normalizePhone("+1 (415) 555-0100"), C.normalizePhone("0091 22 4000 1234")], ["+14155550100", "+912240001234"]);
  const brand = C.scoreContact({ position: "Brand Partnerships Manager", responsibility: "ran 2025 fest deals", emailStatus: "VERIFIED", phoneStatus: "UNAVAILABLE", evidenceDate: new Date().toISOString().slice(0, 10) }, "brand");
  const ceo = C.scoreContact({ position: "CEO", emailStatus: "VERIFIED", phoneStatus: "UNAVAILABLE", companySize: 5000 }, "brand");
  eq("relevant manager outranks the CEO of a large company", brand.score > ceo.score, true);
  eq("missing contact data lowers reliability", C.scoreContact({ position: "Head of CSR", emailStatus: "UNAVAILABLE", phoneStatus: "UNAVAILABLE" }, "csr").parts[2].points, 0);
  eq("wrong designation scores low on role", C.scoreContact({ position: "Software Engineer", emailStatus: "VERIFIED", phoneStatus: "UNAVAILABLE" }, "event").parts[0].points, 5);
  eq("sponsor kind from segment", [C.sponsorKind("csr", ""), C.sponsorKind("brand", "activation"), C.sponsorKind("hiring", "workshop")], ["csr", "brand", "event"]);
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
