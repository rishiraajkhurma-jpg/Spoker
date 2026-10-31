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
    email TEXT, email_status TEXT, phone TEXT, one_liner TEXT, context TEXT, hook TEXT,
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
  `CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, sql TEXT, applied_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS send_budget (k TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, last_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    pw_hash TEXT NOT NULL, disabled INTEGER DEFAULT 0, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT, expires_at TEXT, revoked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, ip TEXT, ok INTEGER, at TEXT)`,
  `CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, company_id TEXT, n INTEGER, start_at TEXT, minutes INTEGER,
    meet_link TEXT, event_id TEXT, status TEXT, notes TEXT, digest TEXT, created_at TEXT)`,
];
// Versioned migrations: each runs once and is recorded in schema_migrations. Only "already exists" errors are tolerated
// (databases created before tracking existed); anything else stops startup instead of being swallowed.
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
  `ALTER TABLE deals ADD COLUMN mou_pdf TEXT`,
  `ALTER TABLE messages ADD COLUMN budget_keys TEXT`,
  `CREATE INDEX IF NOT EXISTS messages_status_idx ON messages (status, scheduled_for)`,
  `CREATE INDEX IF NOT EXISTS messages_company_idx ON messages (company_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id)`,
  `CREATE INDEX IF NOT EXISTS log_ts_idx ON log (ts)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `ALTER TABLE contacts ADD COLUMN department TEXT`,
  `ALTER TABLE contacts ADD COLUMN email_type TEXT`,
  `ALTER TABLE contacts ADD COLUMN email_check TEXT`,
  `ALTER TABLE contacts ADD COLUMN phone_status TEXT`,
  `ALTER TABLE contacts ADD COLUMN phone_type TEXT`,
  `ALTER TABLE contacts ADD COLUMN phone_source TEXT`,
  `ALTER TABLE contacts ADD COLUMN kind TEXT`,
  `ALTER TABLE contacts ADD COLUMN relevance INTEGER`,
  `ALTER TABLE contacts ADD COLUMN relevance_parts TEXT`,
  `ALTER TABLE contacts ADD COLUMN reason TEXT`,
  `ALTER TABLE contacts ADD COLUMN responsibility TEXT`,
  `ALTER TABLE contacts ADD COLUMN evidence TEXT`,
  `ALTER TABLE contacts ADD COLUMN discovered_at TEXT`,
  `ALTER TABLE contacts ADD COLUMN verified_at TEXT`,
  `ALTER TABLE contacts ADD COLUMN reviewed_by TEXT`,
  `ALTER TABLE contacts ADD COLUMN reviewed_at TEXT`,
  `ALTER TABLE contacts DROP COLUMN linkedin_note`,
  `ALTER TABLE contacts DROP COLUMN linkedin_dm`,
  `ALTER TABLE contacts DROP COLUMN linkedin_status`,
  `ALTER TABLE contacts DROP COLUMN linkedin_url`,
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
    // Concurrent cold starts: CREATE IF NOT EXISTS and ON CONFLICT make this safe to run twice.
    for (const s of SCHEMA) await d.q(s);
    const done = new Set((await d.q(`SELECT id FROM schema_migrations`)).map((r) => Number(r.id)));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if (done.has(i + 1)) continue;
      try { await d.q(MIGRATIONS[i]); }
      catch (e: any) { if (!/already exists|duplicate column|no such column|does not exist/i.test(String(e?.message || e))) throw new Error(`Migration ${i + 1} failed: ${e?.message || e}`); }
      await d.q(`INSERT INTO schema_migrations (id, sql, applied_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, [i + 1, MIGRATIONS[i], new Date().toISOString()]);
    }
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
