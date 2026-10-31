// Decision-maker contact checks and relevance scoring. Pure functions plus two network checks (MX lookup, source page fetch).
// Rules: an MX record proves the domain takes mail, not that the inbox exists. A switchboard is never shown as a person's line.
// Private mobile numbers are not stored. Nothing here invents an address or number.
import { resolveMx } from "node:dns/promises";
import { cleanUrl } from "./verify";

export type VStatus = "VERIFIED" | "CORROBORATED" | "UNVERIFIED" | "UNAVAILABLE" | "OUTDATED";
export type SponsorKind = "brand" | "event" | "csr";
const SAFE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function sponsorKind(segment = "", model = ""): SponsorKind {
  if (/csr/i.test(segment + model)) return "csr";
  if (/brand|media|activation|property_naming|brand_integration|offer_codes/i.test(segment + " " + model)) return "brand";
  return "event";
}

const ROLE_WORDS: Record<SponsorKind, { exact: RegExp; near: RegExp }> = {
  brand: { exact: /\b(chief marketing|cmo|head of (marketing|brand)|marketing director|director,? marketing|brand (manager|head|lead|director)|brand partnerships?)\b/i, near: /\b(marketing|brand|campus|youth|growth marketing|communications)\b/i },
  event: { exact: /\b(head of partnerships?|sponsorships?( manager| lead| head)?|(strategic|corporate|brand) partnerships?|experiential( marketing)?|events? (manager|head|lead))\b/i, near: /\b(partnerships?|alliances|ecosystem|community|events?|campus|developer relations|devrel|employer brand(ing)?|university relations)\b/i },
  csr: { exact: /\b(head of csr|csr (manager|head|lead)|corporate communications head|head of corporate communications|community investment|sustainability (head|lead))\b/i, near: /\b(csr|foundation|sustainability|social impact|corporate communications|community)\b/i },
};

export type Check = { status: VStatus; type?: string; normalized?: string; notes: string[] };

/** Fetch a source page once and say whether it literally contains the value (claim-to-source consistency). */
export async function pageContains(url: string, needles: string[], ms = 6000): Promise<"yes" | "no" | "unreachable"> {
  const u = cleanUrl(url);
  if (!u) return "unreachable";
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; SponsorDesk contact check)" }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return "unreachable";
    const t = (await r.text()).slice(0, 2_000_000).toLowerCase().replace(/\s+/g, "");
    return needles.some((n) => n && t.includes(n.toLowerCase().replace(/\s+/g, ""))) ? "yes" : "no";
  } catch { return "unreachable"; }
}

let mxLookup: (domain: string) => Promise<{ exchange: string }[]> = resolveMx;
/** Tests inject a resolver; production uses DNS. */
export function setMxResolver(fn: typeof mxLookup) { mxLookup = fn; }
async function mx(domain: string): Promise<"yes" | "no" | "unknown"> {
  try {
    const r = await Promise.race([mxLookup(domain), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    return r && r.length ? "yes" : "no";
  } catch (e: any) { return /ENOTFOUND|ENODATA/.test(String(e?.code || e?.message)) ? "no" : "unknown"; }
}

const sameOrg = (emailDomain: string, companyDomain: string) => {
  const a = emailDomain.toLowerCase(), b = (companyDomain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!b) return true;
  const root = (h: string) => h.split(".").slice(-2).join(".");
  return a === b || a.endsWith("." + b) || root(a) === root(b);
};

export function emailType(email: string, fullName = ""): "direct" | "departmental" | "company" {
  const local = email.split("@")[0].toLowerCase();
  if (/^(info|contact|hello|support|care|enquir(y|ies)|admin|office|mail)$/.test(local)) return "company";
  if (/^(partnerships?|sponsor(ship)?s?|marketing|brand|events?|csr|pr|media|alliances|campus|careers|press)$/.test(local)) return "departmental";
  const parts = fullName.toLowerCase().split(/\s+/).filter((p) => p.length > 1);
  return parts.some((p) => local.includes(p)) || /[._]/.test(local) ? "direct" : "departmental";
}

/** sourceKind: "crustdata_verified" (enrichment says deliverable), "page" (a URL we can fetch), or "" (model only). */
export async function checkEmail(o: { email?: string; fullName?: string; companyDomain?: string; sourceUrl?: string; sourceKind?: string; evidenceDate?: string; leftCompany?: boolean }): Promise<Check> {
  const email = String(o.email || "").trim();
  if (!email) return { status: "UNAVAILABLE", notes: ["no professional email found"] };
  const notes: string[] = [];
  if (!SAFE_EMAIL.test(email)) return { status: "UNVERIFIED", notes: ["invalid email syntax"], normalized: "" };
  const domain = email.split("@")[1].toLowerCase();
  const type = emailType(email, o.fullName);
  if (o.leftCompany) return { status: "OUTDATED", type, normalized: email, notes: ["the source says this person has left"] };
  if (!sameOrg(domain, o.companyDomain || "")) notes.push(`domain ${domain} differs from the company domain`);
  const m = await mx(domain);
  notes.push(m === "yes" ? "domain accepts mail (MX); inbox not proven" : m === "no" ? "domain has no mail server" : "mail server check unavailable");
  if (m === "no") return { status: "UNVERIFIED", type, normalized: email, notes };
  let onPage: "yes" | "no" | "unreachable" = "unreachable";
  if (o.sourceUrl) { onPage = await pageContains(o.sourceUrl, [email]); notes.push(onPage === "yes" ? "published on the cited page" : onPage === "no" ? "not found on the cited page" : "cited page could not be opened"); }
  else notes.push("no source page");
  const stale = o.evidenceDate && /^\d{4}/.test(o.evidenceDate) && Date.now() - new Date(o.evidenceDate).getTime() > 3 * 365 * 86400e3;
  let status: VStatus = "UNVERIFIED";
  if (o.sourceKind === "crustdata_verified" || onPage === "yes") status = "VERIFIED";
  else if (o.sourceUrl && onPage === "unreachable" && sameOrg(domain, o.companyDomain || "")) status = "CORROBORATED";
  if (stale) { notes.push("evidence older than 3 years"); if (status === "VERIFIED") status = "CORROBORATED"; }
  return { status, type, normalized: email, notes };
}

/** Normalise to E.164 (India default). Personal mobiles are dropped unless published on the company's own site. */
export function normalizePhone(raw: string, defaultCc = "91"): string {
  let p = String(raw || "").replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    p = p.replace(/^0+/, "");
    if (p.length === 10) p = `+${defaultCc}${p}`;
    else if (p.startsWith(defaultCc) && p.length === 12) p = "+" + p;
    else p = "+" + p;
  }
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : "";
}

export async function checkPhone(o: { phone?: string; type?: string; sourceUrl?: string; companyDomain?: string; switchboard?: string }): Promise<Check> {
  const raw = String(o.phone || "").trim();
  if (!raw) return { status: "UNAVAILABLE", notes: ["no business phone found"] };
  const e164 = normalizePhone(raw);
  if (!e164) return { status: "UNVERIFIED", notes: ["not a valid phone number"], normalized: "" };
  let type = /switch|reception|main|head office|corporate office/i.test(o.type || "") ? "switchboard" : /dep|team|office|desk/i.test(o.type || "") ? "departmental" : (o.type === "direct" ? "direct" : "departmental");
  const sb = o.switchboard ? normalizePhone(o.switchboard) : "";
  if (sb && sb === e164) type = "switchboard"; // a company line is never a person's direct line
  const notes = [`E.164 ${e164}`, type === "switchboard" ? "company switchboard, not a direct line" : `${type} line`];
  const onCompanySite = !!o.sourceUrl && !!o.companyDomain && (() => { try { return sameOrg(new URL(o.sourceUrl!).hostname, o.companyDomain!); } catch { return false; } })();
  if (type === "direct" && /^\+91[6-9]\d{9}$/.test(e164) && !onCompanySite) return { status: "UNAVAILABLE", notes: ["looks like a personal mobile not published by the company; not stored"], normalized: "" };
  let status: VStatus = "UNVERIFIED";
  if (o.sourceUrl) {
    const onPage = await pageContains(o.sourceUrl, [e164.slice(-10), raw.replace(/[^\d]/g, "").slice(-10)]);
    notes.push(onPage === "yes" ? "published on the cited page" : onPage === "no" ? "not found on the cited page" : "cited page could not be opened");
    status = onPage === "yes" ? "VERIFIED" : onPage === "unreachable" ? "CORROBORATED" : "UNVERIFIED";
  } else notes.push("no source page");
  return { status, type, normalized: e164, notes };
}

export type ScorePart = { factor: string; points: number; max: number; why: string };

/** Contact relevance out of 100: role 35, sponsorship responsibility 25, contact reliability 20, seniority 10, recency 10. */
export function scoreContact(c: { position?: string; department?: string; responsibility?: string; emailStatus: VStatus; phoneStatus: VStatus; phoneType?: string; evidenceDate?: string; companySize?: number }, kind: SponsorKind): { score: number; parts: ScorePart[] } {
  const pos = `${c.position || ""} ${c.department || ""}`;
  const R = ROLE_WORDS[kind];
  const ceo = /\b(ceo|chief executive|founder|co-?founder|managing director|\bmd\b|chairman|president)\b/i.test(pos);
  let role = 5, roleWhy = "role unrelated to sponsorship";
  if (R.exact.test(pos)) { role = 35; roleWhy = `owns ${kind} sponsorship by title`; }
  else if (R.near.test(pos)) { role = 25; roleWhy = `adjacent ${kind} function`; }
  else if (/\b(growth|business development|bd|sales|partnership)\b/i.test(pos)) { role = 15; roleWhy = "general business role"; }
  if (ceo) { role = (c.companySize || 0) > 200 ? 8 : 22; roleWhy = (c.companySize || 0) > 200 ? "chief executive of a large company: rarely owns event budgets" : "founder at a small company: often decides"; }
  const resp = c.responsibility && c.responsibility.trim() ? 25 : /sponsor|partnership|event|csr|campus|brand/i.test(pos) ? 15 : 5;
  const respWhy = resp === 25 ? "public evidence of sponsorship or partnership work" : resp === 15 ? "title suggests partnership or brand budget" : "no evidence of sponsorship responsibility";
  const ePts: Record<VStatus, number> = { VERIFIED: 12, CORROBORATED: 8, UNVERIFIED: 3, OUTDATED: 0, UNAVAILABLE: 0 };
  const pPts: Record<VStatus, number> = { VERIFIED: 8, CORROBORATED: 5, UNVERIFIED: 2, OUTDATED: 0, UNAVAILABLE: 0 };
  const rel = ePts[c.emailStatus] + (c.phoneType === "switchboard" ? Math.min(2, pPts[c.phoneStatus]) : pPts[c.phoneStatus]);
  const sen = /\b(chief|head|director|vp|vice president|gm|general manager)\b/i.test(pos) ? 10 : /\bmanager|lead\b/i.test(pos) ? 7 : /\b(associate|executive|specialist|coordinator)\b/i.test(pos) ? 4 : 2;
  const age = c.evidenceDate && /^\d{4}/.test(c.evidenceDate) ? (Date.now() - new Date(c.evidenceDate).getTime()) / (365 * 86400e3) : null;
  const rec = age === null ? 2 : age <= 1 ? 10 : age <= 2 ? 6 : 3;
  const parts: ScorePart[] = [
    { factor: "Role relevance", points: role, max: 35, why: roleWhy },
    { factor: "Sponsorship responsibility", points: resp, max: 25, why: respWhy },
    { factor: "Contact reliability", points: rel, max: 20, why: `email ${c.emailStatus.toLowerCase()}, phone ${c.phoneStatus.toLowerCase()}${c.phoneType === "switchboard" ? " (switchboard)" : ""}` },
    { factor: "Seniority and authority", points: sen, max: 10, why: sen >= 10 ? "head or above" : sen >= 7 ? "manager or lead" : "junior or unclear" },
    { factor: "Recency", points: rec, max: 10, why: age === null ? "evidence undated" : `evidence ${age < 1 ? "from the last 12 months" : `about ${Math.round(age)} years old`}` },
  ];
  return { score: parts.reduce((s, p) => s + p.points, 0), parts };
}
