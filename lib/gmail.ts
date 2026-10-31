// Gmail via Google OAuth (web app flow) and the Gmail REST API. Single mailbox: the manager's.
import { getSetting, setSetting } from "./db";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.events", "openid", "email"];
const G = "https://gmail.googleapis.com/gmail/v1/users/me";
let cache: { token: string; exp: number } | null = null;

export function hasGoogleApp() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
export async function connectedEmail() { return getSetting("gmail_email", ""); }

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "", redirect_uri: `${origin}/api/google/callback`, response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchange(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", redirect_uri: `${origin}/api/google/callback`, grant_type: "authorization_code" }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error("Google token exchange failed: " + JSON.stringify(j).slice(0, 300));
  if (j.refresh_token) await setSetting("gmail_refresh", j.refresh_token);
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  const prof: any = await (await fetch(`${G}/profile`, { headers: { authorization: `Bearer ${j.access_token}` } })).json();
  await setSetting("gmail_email", prof.emailAddress || "");
  return prof.emailAddress as string;
}

async function accessToken() {
  if (cache && cache.exp > Date.now()) return cache.token;
  const rt = await getSetting("gmail_refresh", "");
  if (!rt) throw new Error("Gmail is not connected (Settings > Connect Gmail).");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", refresh_token: rt, grant_type: "refresh_token" }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error("Gmail token refresh failed, reconnect Gmail: " + (j.error_description || j.error));
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

async function api(path: string, init: RequestInit = {}) {
  const t = await accessToken();
  const res = await fetch(`${G}${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${t}`, "content-type": "application/json" }, signal: AbortSignal.timeout(30000) });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export const SAFE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export async function send(o: { to: string; subject: string; body: string; threadId?: string | null; inReplyTo?: string | null; fromName?: string }) {
  if (!SAFE_EMAIL.test(o.to || "")) throw new Error("Gmail 400: refused unsafe recipient address");
  if (/[\r\n]/.test(o.subject + (o.fromName || "") + (o.inReplyTo || ""))) throw new Error("Gmail 400: refused header with a line break");
  const from = await connectedEmail();
  const lines = [
    `From: ${o.fromName ? `${encHeader(o.fromName)} <${from}>` : from}`,
    `To: ${o.to}`,
    `Subject: ${encHeader(o.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`);
  const raw = lines.join("\r\n") + "\r\n\r\n" + b64(o.body.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n");
  const sent = await api(`/messages/send`, { method: "POST", body: JSON.stringify({ raw: b64url(raw), ...(o.threadId ? { threadId: o.threadId } : {}) }) });
  let rfc = "";
  try {
    const meta = await api(`/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
    rfc = (meta.payload?.headers || []).find((h: any) => h.name.toLowerCase() === "message-id")?.value || "";
  } catch { /* threading still works via threadId */ }
  return { id: sent.id as string, threadId: sent.threadId as string, rfcId: rfc };
}

function decode(data?: string) {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8") : "";
}
function plainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data);
  for (const p of payload.parts || []) { const t = plainText(p); if (t) return t; }
  if (payload.mimeType === "text/html" && payload.body?.data) return decode(payload.body.data).replace(/<[^>]+>/g, " ");
  return "";
}
function header(m: any, name: string) {
  return (m.payload?.headers || []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export type GMsg = { id: string; threadId: string; from: string; to: string; subject: string; date: string; rfcId: string; text: string };
function toMsg(m: any): GMsg {
  return { id: m.id, threadId: m.threadId, from: header(m, "From"), to: header(m, "To"), subject: header(m, "Subject"), date: header(m, "Date"), rfcId: header(m, "Message-ID"), text: plainText(m.payload) || m.snippet || "" };
}

export async function getMessage(id: string): Promise<GMsg> {
  return toMsg(await api(`/messages/${encodeURIComponent(id)}?format=full`));
}

export async function thread(threadId: string): Promise<GMsg[]> {
  const t = await api(`/threads/${threadId}?format=full`);
  return (t.messages || []).map(toMsg);
}

export async function searchSent(to: string, afterEpochSec: number): Promise<GMsg[]> {
  const q = encodeURIComponent(`in:sent to:${to} after:${afterEpochSec}`);
  const list = await api(`/messages?q=${q}&maxResults=10`);
  const out: GMsg[] = [];
  for (const m of list.messages || []) out.push(toMsg(await api(`/messages/${m.id}?format=full`)));
  return out;
}

/** Mail from a person (not us) anywhere in the mailbox in the last N days, for replies outside our thread. */
export async function fromPerson(email: string, days = 30): Promise<GMsg[]> {
  const q = encodeURIComponent(`from:${email} newer_than:${days}d`);
  const list = await api(`/messages?q=${q}&maxResults=10`);
  const out: GMsg[] = [];
  for (const m of list.messages || []) out.push(toMsg(await api(`/messages/${m.id}?format=full`)));
  return out;
}

/** Search the mailbox (used to find Google Meet "Take notes with Gemini" emails). */
export async function search(q: string, max = 5): Promise<GMsg[]> {
  const list = await api(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  const out: GMsg[] = [];
  for (const m of list.messages || []) out.push(toMsg(await api(`/messages/${m.id}?format=full`)));
  return out;
}

/** Create a Google Calendar event with a Meet link and email the invite to attendees. */
export async function createMeet(o: { summary: string; description: string; startIso: string; minutes: number; attendees: string[] }) {
  const t = await accessToken();
  const start = new Date(o.startIso);
  const end = new Date(start.getTime() + o.minutes * 60000);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: o.summary, description: o.description,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" }, end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: o.attendees.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: "sd-" + Date.now(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error("Calendar: " + JSON.stringify(j).slice(0, 300) + " (reconnect Google in Settings to grant calendar access)");
  return { id: j.id as string, link: (j.hangoutLink || j.htmlLink) as string };
}
