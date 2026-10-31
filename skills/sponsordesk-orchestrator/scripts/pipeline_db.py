#!/usr/bin/env python3
"""SponsorDesk pipeline database (SQLite). The ONLY path to sending: queue -> approve -> claim -> sent.
Rules live here in code, not only in prompts.

Setup
  pipeline_db.py init
  pipeline_db.py config set <key> <value>      keys: postal (e.g. 400076), approvers (comma list of human names),
                                               cap_new_per_day (30), cap_total_per_day (60), spacing_sec (120)
  pipeline_db.py config get
  pipeline_db.py company <company_id> "<name>" [stage]
  pipeline_db.py contact <contact_id> <company_id> <email> "<full name>" [is_primary 0/1]

Sending
  pipeline_db.py queue <key> <contact_id> <company_id> <channel> <sequence> <step> <scheduled_for ISO> <subject_file> <body_file>
        -> QUEUED | EXISTS | REFUSED:<reason>   (runs lint; refuses suppressed contacts, a second live cold thread at a company, cold step > 2)
  pipeline_db.py approve <key> <approver>      human name from config approvers; "auto" only for cold follow-ups with no reply
  pipeline_db.py claim <key>                   -> CLAIMED | ALREADY | BLOCKED:<reason> | WAIT:<seconds> | CAP:<which>
  pipeline_db.py sent <key> <gmail_thread_id> <gmail_message_id>
  pipeline_db.py failed <key>                  pipeline_db.py retry <key>   (failed -> approved, max 3 attempts)
  pipeline_db.py due [now ISO]                 messages that would pass claim's checks now (ignoring caps)
  pipeline_db.py reconcile                     stale claims (verify in Sent by body_hash) + cold steps whose next step was never queued

Replies and people
  pipeline_db.py reply <gmail_message_id> <contact_id> <company_id> <classification> "<summary>" [resume_after ISO]
  pipeline_db.py stop_company <company_id> <reason>
  pipeline_db.py suppress <email> <reason>     pipeline_db.py forget <email>     pipeline_db.py purge <days>
  pipeline_db.py stage <company_id> <NEW_STAGE> "<reason>" [actor]
  pipeline_db.py exception <company_id> <kind> "<question>" "<recommendation>"
  pipeline_db.py status

Times: ISO 8601. A time without an offset is read as IST (+05:30). Stored and compared in UTC.
DB path: $SPONSORDESK_DB or ./sponsordesk.db
"""
import datetime as dt, hashlib, json, os, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "sponsordesk-email", "scripts")))
try:
    import email_lint
except ImportError:  # pragma: no cover
    email_lint = None

DB = os.environ.get("SPONSORDESK_DB", "sponsordesk.db")
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
UTC = dt.timezone.utc

STAGES = ["PACKAGED", "PROSPECT", "QUALIFIED", "CONTACT_READY", "CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2",
          "REPLIED", "MEETING_REQUESTED", "MEETING_SCHEDULED", "MEETING_DONE", "NEGOTIATING", "MOU_DRAFTED",
          "MOU_SENT", "MOU_SIGNED", "PO_RECEIVED", "INVOICED", "PAID", "INKIND_CONFIRMED", "NURTURE", "DELIVERED",
          "REPORTED", "RENEWAL", "DISQUALIFIED", "NO_RESPONSE", "LOST", "OPTED_OUT", "BOUNCED", "PARKED"]
PRE_REPLY = ("PROSPECT", "QUALIFIED", "CONTACT_READY", "CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2")
DEAD = ("OPTED_OUT", "BOUNCED", "LOST", "DISQUALIFIED")
AUTO_NAMES = {"", "auto", "agent", "claude", "system", "bot", "assistant"}
COLD_MAX_STEP = 2                 # step 0 + 2 follow-ups = max 3 cold emails
COLD_GAPS_BD = {1: 3, 2: 5}       # business days after the previous step
DEFAULTS = {"cap_new_per_day": "30", "cap_total_per_day": "60", "spacing_sec": "120"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS config(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, name TEXT, dates TEXT, city TEXT, edition TEXT,
  profile_json TEXT, floor_inr INTEGER, locked_by TEXT, locked_at TEXT);
CREATE TABLE IF NOT EXISTS companies(company_id TEXT PRIMARY KEY, event_id TEXT, name TEXT, domain TEXT, industry TEXT,
  hq TEXT, headcount INTEGER, funding_stage TEXT, fit_score INTEGER, our_pov_score INTEGER, their_pov_score INTEGER,
  intersection INTEGER, tier_suggested TEXT, model TEXT, priority TEXT, reasons_json TEXT, stage TEXT DEFAULT 'PROSPECT',
  stage_reason TEXT, owner TEXT, meeting_count INTEGER DEFAULT 0, role_map_json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS contacts(contact_id TEXT PRIMARY KEY, company_id TEXT, full_name TEXT, position TEXT,
  seniority TEXT, role_in_deal TEXT, email TEXT, email_status TEXT, phone TEXT, linkedin_url TEXT, location TEXT,
  one_liner TEXT, linkedin_context TEXT, personalization_hook TEXT, iitb_alum TEXT, warm_path TEXT, source TEXT,
  source_url TEXT, collected_at TEXT, is_primary INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_verified_at TEXT);
CREATE TABLE IF NOT EXISTS messages(message_id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT UNIQUE NOT NULL,
  contact_id TEXT, company_id TEXT, to_email TEXT, channel TEXT, sequence TEXT, step TEXT, subject TEXT, body TEXT,
  body_hash TEXT, gate TEXT, lint_ok INTEGER DEFAULT 0, status TEXT DEFAULT 'drafted', attempts INTEGER DEFAULT 0,
  gmail_thread_id TEXT, gmail_message_id TEXT, scheduled_for TEXT, claimed_at TEXT, sent_at TEXT,
  approved_by TEXT, cancel_reason TEXT);
CREATE TABLE IF NOT EXISTS replies(reply_id INTEGER PRIMARY KEY AUTOINCREMENT, gmail_message_id TEXT UNIQUE,
  contact_id TEXT, company_id TEXT, received_at TEXT, classification TEXT, summary TEXT, resume_after TEXT,
  suggested_next TEXT, draft_message_id INTEGER, handled INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS suppress(email_hash TEXT PRIMARY KEY, reason TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS meetings(meeting_id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT, n INTEGER,
  start_at TEXT, end_at TEXT, meet_link TEXT, calendar_event_id TEXT, attendees TEXT, deck_path TEXT,
  notes_source TEXT, notes_summary TEXT, action_items_json TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS deals(company_id TEXT PRIMARY KEY, deal_type TEXT DEFAULT 'cash', models TEXT, tier TEXT,
  cash_inr INTEGER, tds_pct REAL, net_cash_inr INTEGER, in_kind_json TEXT, deliverables_json TEXT, exclusivity TEXT,
  vendor_kit_sent INTEGER DEFAULT 0, po_number TEXT, po_date TEXT, payment_terms_days INTEGER, mou_path TEXT,
  mou_status TEXT, signed_at TEXT, invoice_no TEXT, invoice_amount INTEGER, gst_mode TEXT, due_date TEXT, paid_at TEXT);
CREATE TABLE IF NOT EXISTS exceptions(exception_id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT, kind TEXT,
  question TEXT, recommendation TEXT, reasons_json TEXT, draft_message_id INTEGER, status TEXT DEFAULT 'open',
  resolved_at TEXT, resolution_note TEXT);
CREATE TABLE IF NOT EXISTS log(ts TEXT, actor TEXT, company_id TEXT, action TEXT, from_stage TEXT, to_stage TEXT, detail TEXT);
"""


# ---------- helpers ----------
def now():
    return dt.datetime.now(UTC)


def iso(t):
    return t.astimezone(UTC).isoformat(timespec="seconds")


def parse(s):
    t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t.replace(tzinfo=IST) if t.tzinfo is None else t


def ehash(email):
    return hashlib.sha256((email or "").strip().lower().encode()).hexdigest()


def add_business_days(t, n):
    d = t.astimezone(IST)
    while n > 0:
        d += dt.timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def conn():
    c = sqlite3.connect(DB, isolation_level=None, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def cfg(c, k):
    r = c.execute("SELECT v FROM config WHERE k=?", (k,)).fetchone()
    return r["v"] if r else DEFAULTS.get(k)


def log(c, actor, company_id, action, frm=None, to=None, detail=""):
    c.execute("INSERT INTO log VALUES(?,?,?,?,?,?,?)", (iso(now()), actor, company_id, action, frm, to, detail))


def stage_of(c, cid):
    r = c.execute("SELECT stage FROM companies WHERE company_id=?", (cid,)).fetchone()
    return r["stage"] if r else None


def set_stage(c, cid, new, reason, actor="agent"):
    old = stage_of(c, cid)
    c.execute("UPDATE companies SET stage=?, stage_reason=?, updated_at=? WHERE company_id=?", (new, reason, iso(now()), cid))
    log(c, actor, cid, "stage", old, new, reason)


def is_suppressed(c, email):
    return email and c.execute("SELECT 1 FROM suppress WHERE email_hash=?", (ehash(email),)).fetchone() is not None


def human_reply_exists(c, cid):
    return c.execute("SELECT 1 FROM replies WHERE company_id=? AND classification NOT IN ('auto_reply')", (cid,)).fetchone() is not None


def block_reason(c, m, t=None):
    """Why a message may not be sent now (ignoring caps/spacing). None means sendable."""
    t = t or now()
    if m["status"] != "approved":
        return "not_approved"
    if parse(m["scheduled_for"]) > t:
        return "not_yet"
    if is_suppressed(c, m["to_email"]):
        return "suppressed"
    st = stage_of(c, m["company_id"])
    if st in DEAD:
        return f"company_{st.lower()}"
    if m["sequence"] == "cold":
        if st not in PRE_REPLY:
            return f"cold_blocked_stage_{st}"
        if human_reply_exists(c, m["company_id"]):
            return "company_replied"
    return None


def cap_reason(c, m):
    day_start = iso(now().astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0))
    total = c.execute("SELECT COUNT(*) FROM messages WHERE status='sent' AND channel='email' AND sent_at>=?", (day_start,)).fetchone()[0]
    if total >= int(cfg(c, "cap_total_per_day")):
        return "total_per_day"
    if m["sequence"] == "cold" and str(m["step"]) == "0":
        new = c.execute("SELECT COUNT(*) FROM messages WHERE status='sent' AND sequence='cold' AND step='0' AND sent_at>=?", (day_start,)).fetchone()[0]
        if new >= int(cfg(c, "cap_new_per_day")):
            return "new_per_day"
    last = c.execute("SELECT MAX(sent_at) FROM messages WHERE status='sent'").fetchone()[0]
    if last:
        wait = int(cfg(c, "spacing_sec")) - int((now() - parse(last)).total_seconds())
        if wait > 0:
            return f"WAIT:{wait}"
    return None


def due_rows(c, t=None):
    rows = c.execute("SELECT * FROM messages WHERE status='approved' ORDER BY scheduled_for").fetchall()
    return [r for r in rows if block_reason(c, r, t) is None]


# ---------- commands ----------
def main(a):
    if not a:
        print(__doc__); return 1
    cmd, c = a[0], conn()

    if cmd == "init":
        cols = [r["name"] for r in c.execute("PRAGMA table_info(messages)")]
        if cols and "to_email" not in cols:  # database from the first SponsorDesk version
            used = sum(c.execute(f"SELECT COUNT(*) FROM {tb}").fetchone()[0] for tb in ("messages", "companies", "contacts"))
            if used:
                print("OLD_SCHEMA_WITH_DATA: back up", DB, "and migrate by hand (data was not touched)"); return 4
            for tb in ("events", "companies", "contacts", "messages", "replies", "meetings", "deals", "exceptions", "log"):
                c.execute(f"DROP TABLE IF EXISTS {tb}")
            print("upgraded empty old database")
        c.executescript(SCHEMA); print("OK", DB); return 0

    if cmd == "config":
        if a[1] == "set":
            c.execute("INSERT OR REPLACE INTO config VALUES(?,?)", (a[2], a[3])); print("OK")
        else:
            keys = set(DEFAULTS) | {r["k"] for r in c.execute("SELECT k FROM config")}
            print(json.dumps({k: cfg(c, k) for k in sorted(keys)}, indent=1))
        return 0

    if cmd == "company":
        c.execute("INSERT INTO companies(company_id,name,stage,updated_at) VALUES(?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET name=excluded.name",
                  (a[1], a[2], a[3] if len(a) > 3 else "PROSPECT", iso(now()))); print("OK"); return 0

    if cmd == "contact":
        c.execute("INSERT OR REPLACE INTO contacts(contact_id,company_id,email,full_name,is_primary,collected_at) VALUES(?,?,?,?,?,?)",
                  (a[1], a[2], a[3], a[4], int(a[5]) if len(a) > 5 else 1, iso(now()))); print("OK"); return 0

    if cmd == "status":
        for r in c.execute("SELECT stage, COUNT(*) n FROM companies GROUP BY stage ORDER BY n DESC"):
            print(f"{r['stage']:<18}{r['n']}")
        print("open exceptions:", c.execute("SELECT COUNT(*) FROM exceptions WHERE status='open'").fetchone()[0])
        print("unhandled replies:", c.execute("SELECT COUNT(*) FROM replies WHERE handled=0 AND classification<>'auto_reply'").fetchone()[0])
        print("awaiting approval:", c.execute("SELECT COUNT(*) FROM messages WHERE status='drafted'").fetchone()[0])
        print("messages due:", len(due_rows(c)))
        print("stale claims:", c.execute("SELECT COUNT(*) FROM messages WHERE status='claimed'").fetchone()[0])
        print("failed:", c.execute("SELECT COUNT(*) FROM messages WHERE status='failed'").fetchone()[0])
        return 0

    if cmd == "stage":
        cid, new, reason = a[1], a[2], a[3]
        if new not in STAGES:
            print("BAD_STAGE", new); return 2
        if stage_of(c, cid) is None:
            print("NO_COMPANY"); return 2
        set_stage(c, cid, new, reason, a[4] if len(a) > 4 else "agent"); print("OK", new); return 0

    if cmd == "queue":
        key, contact, comp, ch, seq, step, when, sf, bf = a[1:10]
        if c.execute("SELECT 1 FROM messages WHERE idempotency_key=?", (key,)).fetchone():
            print("EXISTS", key); return 0
        subj = open(sf, encoding="utf-8").read().strip(); body = open(bf, encoding="utf-8").read()
        ct = c.execute("SELECT * FROM contacts WHERE contact_id=?", (contact,)).fetchone()
        if not ct or not ct["email"]:
            print("REFUSED:no_contact_email"); return 3
        if ct["company_id"] != comp:
            print("REFUSED:contact_not_at_company"); return 3
        if is_suppressed(c, ct["email"]) or ct["status"] in ("opted_out", "bounced"):
            print("REFUSED:suppressed"); return 3
        if stage_of(c, comp) is None:
            print("REFUSED:no_company"); return 3
        if seq == "cold":
            if not step.isdigit() or int(step) > COLD_MAX_STEP:
                print(f"REFUSED:cold_step_max_{COLD_MAX_STEP}"); return 3
            other = c.execute("""SELECT 1 FROM messages WHERE company_id=? AND sequence='cold' AND contact_id<>?
                                 AND status IN ('drafted','approved','claimed','sent')""", (comp, contact)).fetchone()
            if other and stage_of(c, comp) != "NO_RESPONSE":
                print("REFUSED:one_live_thread_per_company"); return 3
            if human_reply_exists(c, comp):
                print("REFUSED:company_already_replied"); return 3
        if ch == "email" and email_lint:
            problems, _ = email_lint.lint(subj, body, seq, int(step) if step.isdigit() else 9, cfg(c, "postal"))
            if problems:
                print("REFUSED:lint"); [print(" -", p) for p in problems]; return 3
        gate = "auto" if (seq == "cold" and step.isdigit() and int(step) >= 1) else "approve"
        c.execute("""INSERT INTO messages(idempotency_key,contact_id,company_id,to_email,channel,sequence,step,subject,body,
                     body_hash,gate,lint_ok,scheduled_for) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)""",
                  (key, contact, comp, ct["email"], ch, seq, step, subj, body,
                   hashlib.sha256(body.encode()).hexdigest()[:16], gate, iso(parse(when))))
        log(c, "agent", comp, "queue", detail=key); print("QUEUED", key, "gate", gate); return 0

    if cmd == "approve":
        key, who = a[1], (a[2] if len(a) > 2 else "").strip()
        m = c.execute("SELECT * FROM messages WHERE idempotency_key=?", (key,)).fetchone()
        if not m or m["status"] != "drafted":
            print("NOT_DRAFTED"); return 3
        if not m["lint_ok"]:
            print("REFUSED:not_linted"); return 3
        if who.lower() in AUTO_NAMES:
            if m["gate"] != "auto" or human_reply_exists(c, m["company_id"]):
                print("REFUSED:needs_human_approver"); return 3
        else:
            allowed = [x.strip().lower() for x in (cfg(c, "approvers") or "").split(",") if x.strip()]
            if not allowed:
                print("REFUSED:set approvers first (config set approvers \"Name1,Name2\")"); return 3
            if who.lower() not in allowed:
                print("REFUSED:unknown_approver"); return 3
        c.execute("UPDATE messages SET status='approved', approved_by=? WHERE idempotency_key=?", (who or "auto", key))
        log(c, who or "auto", m["company_id"], "approve", detail=key); print("APPROVED"); return 0

    if cmd == "claim":
        m = c.execute("SELECT * FROM messages WHERE idempotency_key=?", (a[1],)).fetchone()
        if not m or m["status"] != "approved":
            print("ALREADY"); return 0
        br = block_reason(c, m)
        if br:
            if br in ("suppressed", "company_replied") or br.startswith(("company_", "cold_blocked")):
                c.execute("UPDATE messages SET status='cancelled', cancel_reason=? WHERE idempotency_key=?", (br, a[1]))
            print("BLOCKED:" + br); return 0
        cr = cap_reason(c, m)
        if cr:
            print(cr if cr.startswith("WAIT") else "CAP:" + cr); return 0
        cur = c.execute("UPDATE messages SET status='claimed', claimed_at=? WHERE idempotency_key=? AND status='approved'", (iso(now()), a[1]))
        print("CLAIMED" if cur.rowcount == 1 else "ALREADY"); return 0

    if cmd == "sent":
        cur = c.execute("UPDATE messages SET status='sent', sent_at=?, gmail_thread_id=?, gmail_message_id=? WHERE idempotency_key=? AND status='claimed'",
                        (iso(now()), a[2], a[3], a[1]))
        m = c.execute("SELECT * FROM messages WHERE idempotency_key=?", (a[1],)).fetchone()
        if not cur.rowcount:
            print("NOT_CLAIMED"); return 3
        log(c, "email", m["company_id"], "sent", detail=a[1])
        if m["sequence"] == "cold":
            st = stage_of(c, m["company_id"])
            nxt = {"0": "CONTACTED", "1": "FOLLOWUP_1", "2": "FOLLOWUP_2"}.get(str(m["step"]))
            if nxt and st in PRE_REPLY:
                set_stage(c, m["company_id"], nxt, f"sent {a[1]}", "email")
            s = int(m["step"])
            if s < COLD_MAX_STEP:
                print("OK NEXT_STEP_NEEDED", f"{m['contact_id']}:cold:{s+1}",
                      "after", iso(add_business_days(now(), COLD_GAPS_BD[s + 1]))); return 0
        print("OK"); return 0

    if cmd == "failed":
        c.execute("UPDATE messages SET status='failed', attempts=attempts+1 WHERE idempotency_key=? AND status='claimed'", (a[1],)); print("OK"); return 0

    if cmd == "retry":
        m = c.execute("SELECT * FROM messages WHERE idempotency_key=?", (a[1],)).fetchone()
        if not m or m["status"] != "failed":
            print("NOT_FAILED"); return 3
        if m["attempts"] >= 3:
            c.execute("INSERT INTO exceptions(company_id,kind,question) VALUES(?,?,?)", (m["company_id"], "send_failed", f"{a[1]} failed 3 times"))
            print("GIVE_UP:exception_raised"); return 0
        c.execute("UPDATE messages SET status='approved' WHERE idempotency_key=?", (a[1],)); print("RETRY_APPROVED"); return 0

    if cmd == "due":
        t = parse(a[1]) if len(a) > 1 else None
        print(json.dumps([{k: r[k] for k in ("idempotency_key", "contact_id", "company_id", "sequence", "step", "scheduled_for")}
                          for r in due_rows(c, t)], indent=1)); return 0

    if cmd == "reconcile":
        cutoff = now() - dt.timedelta(minutes=30)
        stale = [{"key": r["idempotency_key"], "to": r["to_email"], "thread": r["gmail_thread_id"], "body_hash": r["body_hash"],
                  "claimed_at": r["claimed_at"], "check": "search Sent for to:<to> after claimed_at; compare sha256(body)[:16] to body_hash; found -> sent, else failed"}
                 for r in c.execute("SELECT * FROM messages WHERE status='claimed'") if parse(r["claimed_at"]) < cutoff]
        missing = []
        for r in c.execute("SELECT * FROM messages WHERE sequence='cold' AND status='sent'"):
            s = int(r["step"])
            if s >= COLD_MAX_STEP:
                continue
            nk = f"{r['contact_id']}:cold:{s+1}"
            if c.execute("SELECT 1 FROM messages WHERE idempotency_key=?", (nk,)).fetchone():
                continue
            if stage_of(c, r["company_id"]) in PRE_REPLY and not human_reply_exists(c, r["company_id"]) and not is_suppressed(c, r["to_email"]):
                missing.append({"next_key": nk, "thread": r["gmail_thread_id"],
                                "send_after": iso(add_business_days(parse(r["sent_at"]), COLD_GAPS_BD[s + 1]))})
        print(json.dumps({"stale_claims": stale, "missing_next_steps": missing}, indent=1)); return 0

    if cmd == "stop_company":
        cur = c.execute("UPDATE messages SET status='cancelled', cancel_reason=? WHERE company_id=? AND status IN ('drafted','approved')", (a[2], a[1]))
        log(c, "agent", a[1], "stop", detail=a[2]); print("CANCELLED", cur.rowcount); return 0

    if cmd == "reply":
        gid, contact, comp, cls, summ = a[1:6]
        resume = a[6] if len(a) > 6 else None
        try:
            c.execute("INSERT INTO replies(gmail_message_id,contact_id,company_id,received_at,classification,summary,resume_after) VALUES(?,?,?,?,?,?,?)",
                      (gid, contact, comp, iso(now()), cls, summ, iso(parse(resume)) if resume else None))
        except sqlite3.IntegrityError:
            print("DUPLICATE_REPLY"); return 0
        st = stage_of(c, comp)
        ct = c.execute("SELECT email FROM contacts WHERE contact_id=?", (contact,)).fetchone()
        email = ct["email"] if ct else None
        if cls == "auto_reply":
            if resume:
                floor = iso(add_business_days(parse(resume), 2))
                n = c.execute("""UPDATE messages SET scheduled_for=? WHERE contact_id=? AND sequence='cold'
                                 AND status IN ('drafted','approved') AND scheduled_for<?""", (floor, contact, floor)).rowcount
                print("RECORDED auto_reply: sequence continues, pushed", n, "step(s) to", floor)
            else:
                print("RECORDED auto_reply: sequence continues")
            return 0
        if cls in ("opt_out", "bounce"):
            if email:
                c.execute("INSERT OR REPLACE INTO suppress VALUES(?,?,?)", (ehash(email), cls, iso(now())))
            c.execute("UPDATE contacts SET status=? WHERE contact_id=?", ("opted_out" if cls == "opt_out" else "bounced", contact))
            n = c.execute("UPDATE messages SET status='cancelled', cancel_reason=? WHERE contact_id=? AND status IN ('drafted','approved')", (cls, contact)).rowcount
            if st in PRE_REPLY:
                set_stage(c, comp, "OPTED_OUT" if cls == "opt_out" else "BOUNCED", f"reply:{cls}", "a2")
            else:
                c.execute("INSERT INTO exceptions(company_id,kind,question) VALUES(?,?,?)", (comp, "contact_" + cls, f"{contact} {cls} while deal is {st}: {summ}"))
            print("RECORDED", cls, "suppressed, cancelled", n); return 0
        # human reply of any other kind: the whole company leaves the cold loop
        n = c.execute("UPDATE messages SET status='cancelled', cancel_reason='reply' WHERE company_id=? AND sequence='cold' AND status IN ('drafted','approved')", (comp,)).rowcount
        c.execute("UPDATE contacts SET status='replied' WHERE contact_id=?", (contact,))
        if st in PRE_REPLY:
            set_stage(c, comp, "LOST" if cls == "not_interested" else "REPLIED", f"reply:{cls}", "a2")
            print("RECORDED", stage_of(c, comp), "cancelled_cold", n)
        else:
            c.execute("INSERT INTO exceptions(company_id,kind,question) VALUES(?,?,?)", (comp, "reply_on_live_deal", f"{cls} from {contact} while {st}: {summ}"))
            print("RECORDED stage kept", st, "exception raised, cancelled_cold", n)
        return 0

    if cmd == "suppress":
        c.execute("INSERT OR REPLACE INTO suppress VALUES(?,?,?)", (ehash(a[1]), a[2], iso(now())))
        c.execute("UPDATE messages SET status='cancelled', cancel_reason='suppressed' WHERE lower(to_email)=lower(?) AND status IN ('drafted','approved')", (a[1],))
        print("OK"); return 0

    if cmd == "forget":
        e = a[1]
        c.execute("INSERT OR REPLACE INTO suppress VALUES(?,?,?)", (ehash(e), "erasure_request", iso(now())))
        ids = [r["contact_id"] for r in c.execute("SELECT contact_id FROM contacts WHERE lower(email)=lower(?)", (e,))]
        for cid in ids:
            c.execute("""UPDATE contacts SET full_name='[erased]', email=NULL, phone=NULL, linkedin_url=NULL, location=NULL,
                         one_liner=NULL, linkedin_context=NULL, personalization_hook=NULL, warm_path=NULL, status='erased' WHERE contact_id=?""", (cid,))
            c.execute("UPDATE messages SET body='[erased]', subject='[erased]', to_email=NULL, status=CASE WHEN status IN ('drafted','approved') THEN 'cancelled' ELSE status END WHERE contact_id=?", (cid,))
            c.execute("UPDATE replies SET summary='[erased]' WHERE contact_id=?", (cid,))
        log(c, "manager", None, "forget", detail=f"{len(ids)} contact(s)")
        print("ERASED", len(ids), "(email kept only as a hash in the suppression list)"); return 0

    if cmd == "purge":
        cutoff = iso(now() - dt.timedelta(days=int(a[1])))
        ids = [r["contact_id"] for r in c.execute("""SELECT ct.contact_id FROM contacts ct JOIN companies co ON co.company_id=ct.company_id
                 WHERE co.stage IN ('DISQUALIFIED','NO_RESPONSE','LOST','OPTED_OUT','BOUNCED','PARKED') AND co.updated_at<?
                 AND ct.status<>'erased'""", (cutoff,))]
        for cid in ids:
            c.execute("""UPDATE contacts SET phone=NULL, linkedin_context=NULL, personalization_hook=NULL, one_liner=NULL, location=NULL,
                         status='purged' WHERE contact_id=?""", (cid,))
        print("PURGED", len(ids)); return 0

    if cmd == "exception":
        c.execute("INSERT INTO exceptions(company_id,kind,question,recommendation) VALUES(?,?,?,?)", (a[1], a[2], a[3], a[4] if len(a) > 4 else ""))
        print("OK"); return 0

    print(__doc__); return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
