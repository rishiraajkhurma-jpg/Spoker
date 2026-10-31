// Database layer. Postgres (Neon) in production; any driver implementing DB can be injected for tests.
export type Row = Record<string, any>;
export interface DB {
  q(text: string, params?: any[]): Promise<Row[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, profile TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT, domain TEXT, segment TEXT,
    stage TEXT, stage_reason TEXT, our_pov INTEGER, their_pov INTEGER, intersection INTEGER, priority TEXT,
    model TEXT, tier TEXT, price_range TEXT, angle TEXT, audience_benefit TEXT, reasons TEXT, role_map TEXT,
    decision TEXT, why_now TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, company_id TEXT, full_name TEXT, position TEXT,
    email TEXT, email_status TEXT, phone TEXT, linkedin_url TEXT, one_liner TEXT, context TEXT, hook TEXT,
    iitb_alum TEXT, warm_path TEXT, source TEXT, status TEXT, is_primary INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, contact_id TEXT,
    company_id TEXT, to_email TEXT, sequence TEXT, step INTEGER, subject TEXT, body TEXT, body_hash TEXT,
    gate TEXT, lint_ok INTEGER, status TEXT, attempts INTEGER, thread_id TEXT, gmail_id TEXT,
    rfc_message_id TEXT, scheduled_for TEXT, claimed_at TEXT, sent_at TEXT, approved_by TEXT,
    cancel_reason TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, gmail_id TEXT UNIQUE, contact_id TEXT,
    company_id TEXT, received_at TEXT, classification TEXT, summary TEXT, offer_inr INTEGER,
    resume_after TEXT, handled INTEGER)`,
  `CREATE TABLE IF NOT EXISTS suppress (email_hash TEXT PRIMARY KEY, reason TEXT, at TEXT)`,
  `CREATE TABLE IF NOT EXISTS exceptions (id TEXT PRIMARY KEY, company_id TEXT, kind TEXT, question TEXT,
    recommendation TEXT, draft_subject TEXT, draft_body TEXT, status TEXT, created_at TEXT,
    resolved_at TEXT, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS deals (company_id TEXT PRIMARY KEY, tier TEXT, cash_inr INTEGER,
    in_kind TEXT, deliverables TEXT, mou TEXT, status TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS log (id TEXT PRIMARY KEY, ts TEXT, actor TEXT, company_id TEXT, action TEXT,
    from_stage TEXT, to_stage TEXT, detail TEXT)`,
  `CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY, company_id TEXT, json TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, company_id TEXT, n INTEGER, start_at TEXT, minutes INTEGER,
    meet_link TEXT, event_id TEXT, status TEXT, notes TEXT, digest TEXT, created_at TEXT)`,
];
// Columns added after v1; each runs once and errors (already exists) are ignored.
const MIGRATIONS = [
  `ALTER TABLE companies ADD COLUMN sources TEXT`,
  `ALTER TABLE companies ADD COLUMN meeting_count INTEGER DEFAULT 0`,
  `ALTER TABLE companies ADD COLUMN draft_subject TEXT`,
  `ALTER TABLE companies ADD COLUMN draft_body TEXT`,
  `ALTER TABLE companies ADD COLUMN deck_id TEXT`,
  `ALTER TABLE contacts ADD COLUMN email_source TEXT`,
  `ALTER TABLE contacts ADD COLUMN linkedin_note TEXT`,
  `ALTER TABLE contacts ADD COLUMN linkedin_dm TEXT`,
  `ALTER TABLE contacts ADD COLUMN linkedin_status TEXT`,
  `ALTER TABLE deals ADD COLUMN share_id TEXT`,
];

let injected: DB | null = null;
let cached: DB | null = null;
let ready: Promise<void> | null = null;

export function setDB(d: DB) {
  injected = d;
  ready = null;
}

async function makeNeon(): Promise<DB> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set. In Vercel: Storage > Create Database > Neon, then redeploy.");
  const { neon } = await import("@neondatabase/serverless");
  const sql: any = neon(url);
  return { q: async (text: string, params: any[] = []) => (await sql.query(text, params)) as Row[] };
}

export async function db(): Promise<DB> {
  const d = injected || cached || (cached = await makeNeon());
  if (!ready) ready = (async () => {
    for (const s of SCHEMA) await d.q(s);
    for (const m of MIGRATIONS) { try { await d.q(m); } catch { /* column exists */ } }
  })();
  await ready;
  return d;
}

export const nowIso = () => new Date().toISOString();
export const uid = () => (globalThis.crypto as any).randomUUID();
export const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));
export function json<T = any>(s: any, fallback: T): T {
  if (s === null || s === undefined || s === "") return fallback;
  if (typeof s !== "string") return s as T;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export async function getSetting(k: string, dflt = ""): Promise<string> {
  const d = await db();
  const r = await d.q(`SELECT v FROM settings WHERE k=$1`, [k]);
  return r[0]?.v ?? dflt;
}
export async function setSetting(k: string, v: string) {
  const d = await db();
  await d.q(`INSERT INTO settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v=excluded.v`, [k, v]);
}
