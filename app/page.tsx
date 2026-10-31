"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Any = any;

// ---------- helpers ----------
async function api(path: string, body?: Any) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    // Session missing or expired: every screen falls back to the sign-in form instead of showing an error.
    if (typeof window !== "undefined") window.dispatchEvent(new Event("sd-signed-out"));
    throw Object.assign(new Error("Your session ended. Please sign in again."), { code: 401 });
  }
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
const inr = (n: Any) => (n || n === 0 ? "₹" + Number(n).toLocaleString("en-IN") : "");
const when = (s?: string) => (s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const clock = (s?: string) => (s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");
function ago(s?: string) {
  if (!s) return "";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
function nextSlots(n = 3) {
  const out: string[] = [];
  const d = new Date();
  const hours = [11, 15];
  let i = 0;
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const h = hours[i++ % 2];
    out.push(`${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${h === 11 ? "11:00" : "15:30"} IST`);
  }
  return out;
}
function localInput(daysAhead = 2, hour = 11) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const copy = (t: string) => navigator.clipboard?.writeText(t);

// ---------- agents (the people this replaces) ----------
const AGENTS = [
  { id: "A0", name: "Package", job: "Researches the event, prices the tiers" },
  { id: "A1", name: "Prospect", job: "Finds and scores sponsors from both sides" },
  { id: "A2", name: "Outreach", job: "Contacts, priced offers, follow-ups, replies" },
  { id: "A3", name: "Schedule", job: "Books meetings with Meet links" },
  { id: "A4", name: "Pitch", job: "Builds the company-specific deck" },
  { id: "A5", name: "Negotiate", job: "Digests meetings, counters inside the floor" },
  { id: "A6", name: "Close", job: "Drafts the MOU" },
  { id: "A7", name: "Nurture", job: "Keeps signed sponsors updated" },
  { id: "Email", name: "Email agent", job: "Lints, approves, sends, never twice" },
];
const OP_AGENT: Record<string, string> = { brief: "A0", lock_floor: "A0", discover: "A1", analyze: "A1", set_email: "A2", replies: "A2", simulate: "A2", schedule: "A3", confirm_meeting: "A3", deck: "A4", notes: "A5", gemini_notes: "A5", resolve: "A5", mou: "A6", send_mou: "A6", nurture: "A7", send: "Email", approve: "Email", approve_many: "Email", cycle: "Email" };
const HUMAN = (a: string) => !/^(A\d|Email|Orchestrator|email|cycle|agent|a\d)$/i.test(a);

const COLUMNS = [
  { title: "Research", stages: ["PROSPECT", "QUALIFIED", "CONTACT_READY"] },
  { title: "Outreach", stages: ["CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2"] },
  { title: "In conversation", stages: ["REPLIED", "MEETING_REQUESTED", "MEETING_SCHEDULED", "MEETING_DONE"] },
  { title: "Negotiating", stages: ["NEGOTIATING"] },
  { title: "Closing", stages: ["MOU_DRAFTED", "MOU_SENT", "MOU_SIGNED", "PO_RECEIVED", "INVOICED"] },
  { title: "Won", stages: ["PAID", "INKIND_CONFIRMED", "NURTURE", "DELIVERED", "REPORTED", "RENEWAL"] },
  { title: "Closed out", stages: ["NO_RESPONSE", "LOST", "OPTED_OUT", "BOUNCED", "DISQUALIFIED", "PARKED"] },
];
const STAGE_LABEL: Record<string, string> = {
  PROSPECT: "Found", QUALIFIED: "Scored", CONTACT_READY: "Contact found", CONTACTED: "Offer sent", FOLLOWUP_1: "Follow-up 1", FOLLOWUP_2: "Follow-up 2",
  REPLIED: "Replied", MEETING_REQUESTED: "Meeting asked", MEETING_SCHEDULED: "Meeting booked", MEETING_DONE: "Met", NEGOTIATING: "Negotiating",
  MOU_DRAFTED: "MOU drafted", MOU_SENT: "MOU sent", MOU_SIGNED: "MOU signed", PO_RECEIVED: "PO received", INVOICED: "Invoiced", PAID: "Paid",
  INKIND_CONFIRMED: "In-kind confirmed", NURTURE: "Nurture", DELIVERED: "Delivered", REPORTED: "Reported", RENEWAL: "Renewal",
  NO_RESPONSE: "No response", LOST: "Lost", OPTED_OUT: "Opted out", BOUNCED: "Bounced", DISQUALIFIED: "Dropped", PARKED: "Parked",
};
const NAV = ["Command", "Pipeline", "Decision Makers", "Outbox", "Inbox", "Contacts", "Meetings", "Deals", "Sponsors", "Settings"] as const;
type View = (typeof NAV)[number];

// ---------- app ----------
export default function Page() {
  const [data, setData] = useState<Any>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("Command");
  const [busy, setBusy] = useState<{ op: string; label: string } | null>(null);
  const [toast, setToast] = useState("");
  const [openCo, setOpenCo] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const toastT = useRef<Any>(null);

  async function load() {
    try { setData(await api("/api/state")); setAuthed(true); }
    catch (e: Any) { if (e.code !== 401) flash(e.message); }
  }
  function flash(m: string) { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 7000); }
  async function act(op: string, body: Any = {}, label = "", reload = true) {
    setBusy({ op, label: label || op });
    try { const r = await api("/api/act", { op, ...body }); if (reload) await load(); return r; }
    catch (e: Any) { if (e.code !== 401) flash(e.message); return null; }
    finally { setBusy(null); }
  }
  useEffect(() => {
    const out = () => { setAuthed(false); setData(null); setProgress(null); };
    window.addEventListener("sd-signed-out", out);
    return () => window.removeEventListener("sd-signed-out", out);
  }, []);
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (q) { flash(q === "connected" ? "Google connected: Gmail and Calendar are live" : "Google: " + q); window.history.replaceState({}, "", "/"); }
  }, []);
  // Live console while agents work
  useEffect(() => {
    if (!busy && !progress) return;
    const t = setInterval(async () => {
      try { const r = await api("/api/state?log_only=1"); setData((d: Any) => (d ? { ...d, log: r.log } : d)); } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(t);
  }, [busy, progress]);

  if (authed === false) return <Login onDone={load} />;
  if (!data) return <div className="login"><div className="muted" style={{ color: "#8ea3bb" }}>Opening SponsorDesk...</div></div>;

  const drafts = data.messages.filter((m: Any) => m.status === "drafted");
  const openEx = data.exceptions.filter((x: Any) => x.status === "open");
  const toReview = data.contacts.filter((c: Any) => c.is_primary && !c.reviewed_at && ["UNVERIFIED", "UNAVAILABLE", "OUTDATED"].includes(c.email_status)).length;
  const counts: Record<string, Any> = { Outbox: drafts.length + data.messages.filter((m: Any) => m.status === "needs_manual_review").length, Inbox: openEx.length, "Decision Makers": toReview };
  const approver = data.me?.name || "";
  const liveAgent = busy ? OP_AGENT[busy.op] : progress ? (progress.label.startsWith("Scoring") ? "A1" : "A1") : "";

  const me = data.me || { role: "readonly" };
  const can = (r: string) => ({ readonly: 0, operator: 1, approver: 2, admin: 3 } as Any)[me.role] >= ({ readonly: 0, operator: 1, approver: 2, admin: 3 } as Any)[r];
  const ctx = { data, act, busy, flash, load, setView, open: setOpenCo, approver, progress, setProgress, me, can };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="logo"><div className="logo-mark">S</div><div><b>SponsorDesk</b><small>{data.event?.name || "No event yet"}</small></div></div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n} className={view === n ? "on" : ""} onClick={() => setView(n)}>
              <span>{n}</span>{counts[n] ? <span className={"count" + (n === "Inbox" ? " warn" : "")}>{counts[n]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="agents">
          <h4>Agents on the desk</h4>
          {AGENTS.map((a) => {
            const last = data.log.find((l: Any) => l.actor === a.id);
            const live = liveAgent === a.id;
            return (
              <div key={a.id} className={"agent" + (live ? " live" : "")} title={a.job}>
                <div className="badge">{a.id === "Email" ? "@" : a.id}</div>
                <div><div className="who">{a.name}</div><div className="what">{live ? (busy?.label || progress?.label || "working") : last ? `${last.detail || last.action} (${ago(last.ts)})` : a.job}</div></div>
              </div>
            );
          })}
        </div>
        <div className="rail-foot">
          {me.name ? <>{me.name} · {me.role}<br /></> : null}Research: {data.settings.source === "crustdata" ? "Crustdata" : "live web search"} · {data.settings.model}<br />
          <button onClick={() => api("/api/logout", {}).then(() => setAuthed(false))}>Log out</button>
        </div>
      </aside>
      <main className="main">
        {view === "Command" && <Command {...ctx} />}
        {view === "Pipeline" && <Pipeline {...ctx} />}
        {view === "Outbox" && <Outbox {...ctx} />}
        {view === "Inbox" && <Inbox {...ctx} />}
        {view === "Contacts" && <Contacts {...ctx} />}
        {view === "Decision Makers" && <DecisionMakers {...ctx} />}
        {view === "Meetings" && <Meetings {...ctx} />}
        {view === "Deals" && <Deals {...ctx} />}
        {view === "Sponsors" && <Sponsors {...ctx} />}
        {view === "Settings" && <Settings {...ctx} />}
      </main>
      {openCo && <Room {...ctx} id={openCo} close={() => setOpenCo("")} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Login({ onDone }: Any) {
  const [pw, setPw] = useState(""); const [em, setEm] = useState(""); const [err, setErr] = useState(""); const [wait, setWait] = useState(false);
  async function go() { setWait(true); setErr(""); try { await api("/api/login", { email: em, password: pw }); onDone(); } catch (e: Any) { setErr(e.message); } finally { setWait(false); } }
  return (
    <div className="login"><div className="panel">
      <div className="logo" style={{ color: "var(--text)", marginBottom: 14 }}><div className="logo-mark">S</div><div><b>SponsorDesk</b></div></div>
      <label className="f" htmlFor="em">Work email</label>
      <input id="em" type="email" autoComplete="username" value={em} onChange={(e) => setEm(e.target.value)} autoFocus />
      <label className="f" htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <p className="tiny faint" style={{ margin: "6px 0 0" }}>First sign-in on a new desk: your email plus the team password creates the admin account.</p>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={wait || !em || !pw} onClick={go}>{wait ? "Signing in..." : "Sign in"}</button><span className="small" role="alert" style={{ color: "var(--bad)" }}>{err}</span></div>
    </div></div>
  );
}

function Head({ title, sub, children }: Any) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="row">{children}</div></div>;
}

// ---------- Command: one line in, autopilot out ----------
function Command({ data, act, busy, approver, progress, setProgress, flash, open, load, setView }: Any) {
  const e = data.event;
  const [line, setLine] = useState("");
  const [me, setMe] = useState({ name: "", title: "", phone: "", email: "" });
  const [count, setCount] = useState(8);
  const [clarify, setClarify] = useState<Any>(null);
  const s = data.settings;
  async function brief(l: string, sender: Any, answers = "") {
    const r = await act("brief", { line: l, sender, answers }, answers ? "Researching again with your answers" : "Researching the event and pricing the tiers");
    if (r?.clarify) setClarify({ ...r.clarify, line: l, sender });
    else if (r) setClarify(null);
    return r;
  }
  const cos = data.companies;

  async function autopilot() {
    const r = await act("discover", { count }, `Finding ${count} sponsors with live budget signals`);
    if (!r) return;
    const ids: string[] = r.added || [];
    const todo = [...ids, ...cos.filter((c: Any) => c.stage === "PROSPECT" && !ids.includes(c.id)).map((c: Any) => c.id)];
    for (let i = 0; i < todo.length; i++) {
      setProgress({ done: i, total: todo.length, label: `Scoring company ${i + 1} of ${todo.length}, finding the decision maker, drafting the offer` });
      try { await api("/api/act", { op: "analyze", company_id: todo[i] }); } catch (err: Any) { flash(err.message); }
      await load();
    }
    setProgress(null);
    flash(`Autopilot done: ${todo.length} companies researched. Offers are in the Outbox for your approval.`);
  }

  if (!e) {
    return (
      <>
        <div className="composer">
          <div className="glyph" aria-hidden>₹</div>
          <h1>Tell the desk which event needs sponsors.</h1>
          <p>One line is enough. The packaging agent researches the event on the web, finds last year's numbers and sponsors, and proposes tiers and a floor price for you to lock.</p>
          <div className="line">
            <input value={line} onChange={(x) => setLine(x.target.value)} placeholder="E-Summit 2027, IIT Bombay, Jan 2027, goal ₹40 lakh" aria-label="Event in one line" />
            <button className="btn big" disabled={!!busy || !line || !me.name} onClick={() => brief(line, me)}>{busy ? "Researching..." : "Research and package"}</button>
          </div>
          <div className="meta">
            <input value={me.name} onChange={(x) => setMe({ ...me, name: x.target.value })} placeholder="Your name (signs the emails)" aria-label="Your name" />
            <input value={me.title} onChange={(x) => setMe({ ...me, title: x.target.value })} placeholder="Your title" aria-label="Your title" />
            <input value={me.phone} onChange={(x) => setMe({ ...me, phone: x.target.value })} placeholder="Phone for the signature" aria-label="Phone" />
          </div>
        </div>
        {clarify && <Clarify c={clarify} busy={busy} onAnswer={(a: string) => brief(clarify.line, clarify.sender, a)} />}
        {busy && <Console data={data} />}
      </>
    );
  }

  const prospects = cos.filter((c: Any) => c.stage === "PROSPECT").length;
  const pipelineValue = cos.filter((c: Any) => c.priority === "P1" || c.priority === "P2").length;
  const won = data.deals.reduce((s0: number, d: Any) => s0 + Number(d.cash_inr || 0), 0);
  return (
    <>
      <Head title={e.name} sub={`${e.dates || ""}${e.city ? ", " + e.city : ""}. ${e.one_line || ""}`}>
        <button className="btn ghost" disabled={!!busy} onClick={() => api("/api/cycle", {}).then((r) => { flash(`Daily cycle: sent ${r?.send?.sent ?? 0}, new replies ${r?.replies?.found ?? 0}. ${(r?.send?.notes || []).join(" ")}`); load(); }).catch((x) => flash(x.message))}>Run daily cycle</button>
      </Head>
      {clarify && <Clarify c={clarify} busy={busy} onAnswer={(a: string) => brief(clarify.line, clarify.sender, a)} />}
      {!e.floor_locked ? <BriefCard e={e} act={act} busy={busy} approver={approver} brief={brief} /> : (
        <div className="composer">
          <div className="glyph" aria-hidden>₹</div>
          <h1>{cos.length ? "Send the desk after more sponsors." : "The floor is locked. Start the autopilot."}</h1>
          <p>Finds companies with live budget signals, scores each from your side and theirs, finds and verifies the decision makers, writes a priced offer. Every claim links to its source. Nothing is sent until you approve it.</p>
          <div className="line">
            <select value={count} onChange={(x) => setCount(Number(x.target.value))} aria-label="How many companies" style={{ background: "var(--ink-2)", color: "#fff", borderColor: "var(--ink-3)" }}>
              {[5, 8, 12, 15, 20].map((n) => <option key={n} value={n}>{n} new companies</option>)}
            </select>
            <button className="btn big" disabled={!!busy || !!progress} onClick={autopilot}>{progress ? "Autopilot running..." : "Run autopilot"}</button>
          </div>
          {progress && <><div className="progress" style={{ background: "var(--ink-2)" }}><i style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div><div className="small" style={{ color: "#c9d4ff" }}>{progress.label}</div></>}
          {prospects > 0 && !progress && <p className="small" style={{ margin: "10px 0 0" }}>{prospects} found companies are waiting to be scored; the autopilot picks them up too.</p>}
        </div>
      )}
      <div className="stats">
        <div className="stat"><b>{cos.length}</b><span>companies on the desk</span></div>
        <div className="stat"><b>{pipelineValue}</b><span>P1 and P2 targets</span></div>
        <div className="stat"><b>{data.messages.filter((m: Any) => m.status === "drafted").length}</b><span>emails waiting for you</span></div>
        <div className="stat"><b>{data.exceptions.filter((x: Any) => x.status === "open").length}</b><span>decisions only you can make</span></div>
        <div className="stat"><b className="money">{inr(won) || "₹0"}</b><span>in drafted MOUs</span></div>
      </div>
      <div className="grid g2">
        <div className="panel">
          <div className="spread"><h2>Live desk</h2><span className="tiny faint">every agent action, newest first</span></div>
          <Console data={data} open={open} />
        </div>
        <div className="panel">
          <div className="spread"><h2>Top targets</h2><button className="btn quiet" onClick={() => setView("Pipeline")}>Open pipeline</button></div>
          {cos.filter((c: Any) => c.intersection != null && c.stage !== "DISQUALIFIED").slice(0, 7).map((c: Any) => (
            <button key={c.id} className="card" onClick={() => open(c.id)}>
              <div className="name"><span>{c.name}</span><span className={"chip " + (c.priority === "P1" ? "p1" : c.priority === "P2" ? "p2" : "")}>{c.priority} · fit {c.intersection}</span></div>
              <div className="angle">{c.angle}</div>
              <div className="row"><span className="chip stage">{STAGE_LABEL[c.stage] || c.stage}</span>{c.price_range && <span className="chip money">{c.price_range}</span>}</div>
            </button>
          ))}
          {!cos.length && <div className="empty"><h3>No companies yet</h3>Lock the floor and run the autopilot.</div>}
        </div>
      </div>
      {e.floor_locked && <BriefSummary e={e} />}
    </>
  );
}

function BriefCard({ e, act, busy, approver, brief }: Any) {
  const nSrc = (e.sources || []).filter((x: Any) => x.verified !== false).length;
  const [floor, setFloor] = useState(e.floor_inr || 0);
  const [edit, setEdit] = useState<Any>(null);
  return (
    <div className="panel">
      <div className="spread"><div><h2>A0 packaged your event. Check it, then lock the floor.</h2><p className="sub">{nSrc > 0 ? `Researched from ${nSrc} verified web source${nSrc === 1 ? "" : "s"}. ` : ""}Prices are suggestions until you lock them.</p></div>
        <button className="btn ghost" onClick={() => setEdit(edit ? null : JSON.parse(JSON.stringify(e)))}>{edit ? "Cancel edit" : "Edit details"}</button></div>
      <Redo e={e} busy={busy} brief={brief} />
      {edit ? <BriefEdit e={edit} setE={setEdit} done={() => setEdit(null)} /> : <>
        <dl className="kv">
          <dt>Audience</dt><dd>{e.audience}</dd>
          <dt>Past sponsors</dt><dd>{e.past_sponsors}</dd>
          <dt>Proof</dt><dd>{(e.proof_items || []).some((p: Any) => p.verified)
            ? (e.proof_items || []).filter((p: Any) => p.verified).map((p: Any, i: number) => <div key={i}>{p.claim} <a className="source" href={p.url} target="_blank" rel="noreferrer">{String(p.url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a></div>)
            : e.proof}</dd>
          <dt>In-kind needs</dt><dd>{e.inkind_needs}</dd>
          <dt>Signature</dt><dd>{[e.sender?.name, e.sender?.title, e.sender?.org, e.postal_address].filter(Boolean).join(", ")}</dd>
        </dl>
        <h3 style={{ margin: "16px 0 8px", fontSize: 15 }}>Tiers</h3>
        <div className="tiers">{(e.tiers || []).map((t: Any) => <div key={t.name} className="tier"><b>{t.name}</b><span className="money">{inr(t.price_inr)}</span><div className="small muted">{t.deliverables}</div></div>)}</div>
        <div className="floor">
          <div style={{ flex: "1 1 260px" }}><b>Floor price</b><div className="small muted">The smallest cash deal the agents may accept without you. Below it, they bring it to your inbox.</div></div>
          <input type="number" value={floor} onChange={(x) => setFloor(Number(x.target.value))} style={{ width: 160 }} aria-label="Floor in rupees" />
          <button className="btn" disabled={!!busy || !floor} onClick={() => act("lock_floor", { floor, approver }, "Locking the floor")}>Lock floor at {inr(floor)}</button>
        </div>
        <Sources list={e.sources} />
      </>}
    </div>
  );
}

function Clarify({ c, busy, onAnswer }: Any) {
  const [a, setA] = useState("");
  return (
    <div className="panel clarify" role="region" aria-label="A0 needs more detail">
      <h2>A0 needs a little more before packaging this event</h2>
      <p className="sub">{c.found}</p>
      <ol>{(c.questions || []).map((q: string, i: number) => <li key={i}>{q}</li>)}</ol>
      <textarea value={a} onChange={(x) => setA(x.target.value)} placeholder="Answer here: website link, institute, year, who attends..." aria-label="Your answers" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" disabled={!!busy || !a.trim()} onClick={() => onAnswer(a.trim()).then(() => setA(""))}>{busy ? "Researching..." : "Answer and research again"}</button>
        <span className="small muted">Nothing is packaged until the event is clear.</span>
      </div>
      <Sources list={c.sources} />
    </div>
  );
}

function Redo({ e, busy, brief }: Any) {
  const [line, setLine] = useState("");
  return (
    <div className="row" style={{ margin: "4px 0 14px" }}>
      <input value={line} onChange={(x) => setLine(x.target.value)} placeholder="Not right? Describe the event in one line and A0 researches it again" style={{ flex: 1, minWidth: 260 }} />
      <button className="btn ghost" disabled={!!busy || !line} onClick={() => brief(line, e.sender || {}).then(() => setLine(""))}>{busy ? "Researching..." : "Research again"}</button>
    </div>
  );
}

function BriefEdit({ e, setE, done }: Any) {
  const set = (k: string, v: Any) => setE({ ...e, [k]: v });
  const F = (k: string, label: string, area = false) => <div><label className="f">{label}</label>{area ? <textarea value={e[k] || ""} onChange={(x) => set(k, x.target.value)} /> : <input value={e[k] || ""} onChange={(x) => set(k, x.target.value)} />}</div>;
  return (
    <>
      <div className="grid g2">{F("name", "Event")}{F("organizer", "Organiser")}{F("dates", "Dates")}{F("city", "City")}{F("website", "Website")}{F("postal_address", "Postal address (printed on cold emails)")}</div>
      {F("audience", "Audience facts with sources", true)}{F("proof", "Proof", true)}{F("inkind_needs", "In-kind needs", true)}
      <label className="f">Tiers</label>
      {e.tiers.map((t: Any, i: number) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1fr 3fr", marginBottom: 6 }}>
          <input value={t.name} onChange={(x) => set("tiers", e.tiers.map((y: Any, j: number) => (j === i ? { ...y, name: x.target.value } : y)))} />
          <input type="number" value={t.price_inr} onChange={(x) => set("tiers", e.tiers.map((y: Any, j: number) => (j === i ? { ...y, price_inr: Number(x.target.value) } : y)))} />
          <input value={t.deliverables} onChange={(x) => set("tiers", e.tiers.map((y: Any, j: number) => (j === i ? { ...y, deliverables: x.target.value } : y)))} />
        </div>
      ))}
      <div className="grid g2">
        {["name", "title", "phone", "email"].map((k) => <div key={k}><label className="f">Sender {k}</label><input value={e.sender?.[k] || ""} onChange={(x) => set("sender", { ...e.sender, [k]: x.target.value })} /></div>)}
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={() => api("/api/event", { profile: e }).then(() => location.reload()).catch((x) => alert(x.message))}>Save brief</button><button className="btn ghost" onClick={done}>Cancel</button></div>
    </>
  );
}

function BriefSummary({ e }: Any) {
  return (
    <div className="panel">
      <div className="spread"><h2>What we sell</h2><span className="small">Floor <span className="money">{inr(e.floor_inr)}</span>, locked</span></div>
      <div className="tiers" style={{ marginTop: 10 }}>{(e.tiers || []).map((t: Any) => <div key={t.name} className="tier"><b>{t.name}</b><span className="money">{inr(t.price_inr)}</span><div className="small muted">{t.deliverables}</div></div>)}</div>
    </div>
  );
}

function Sources({ list }: Any) {
  if (!list?.length) return null;
  return (
    <details style={{ marginTop: 12 }}><summary>{list.length} sources</summary>
      <div style={{ marginTop: 8 }}>{list.map((s: Any, i: number) => <span key={i} className="source"><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></span>)}</div>
    </details>
  );
}

function Console({ data, open }: Any) {
  const rows = data.log.filter((l: Any) => !["queue", "approve", "stage"].includes(l.action) || l.actor !== "agent").slice(0, 80);
  return (
    <div className="console" aria-live="polite">
      {rows.map((l: Any) => (
        <div key={l.id} className="ev">
          <span className="t">{clock(l.ts)}</span>
          <span className={"a" + (HUMAN(l.actor) ? " human" : "")}>{l.actor}</span>
          <span>{l.company_id && open ? <a href="#" onClick={(x) => { x.preventDefault(); open(l.company_id); }}><b>{l.company_id}</b></a> : l.company_id ? <b>{l.company_id}</b> : null} {l.action === "stage" ? <span className="muted">moved to {STAGE_LABEL[l.to_stage] || l.to_stage}</span> : l.detail || l.action}</span>
        </div>
      ))}
      {!rows.length && <div className="empty small">The desk is quiet.</div>}
    </div>
  );
}

// ---------- Pipeline ----------
function Pipeline({ data, open, act, busy }: Any) {
  const [add, setAdd] = useState({ name: "", domain: "", note: "" });
  return (
    <>
      <Head title="Pipeline" sub="Every company the desk is working, by stage. Open one to see its deal room.">
        <input placeholder="Add a company (e.g. last year's sponsor)" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} style={{ width: 260 }} />
        <input placeholder="domain.com" value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value })} style={{ width: 150 }} />
        <button className="btn ghost" disabled={!add.name || !!busy} onClick={() => act("add_company", add).then((r: Any) => { if (r?.id) { setAdd({ name: "", domain: "", note: "" }); act("analyze", { company_id: r.id }, `Scoring ${add.name}`); } })}>Add and score</button>
      </Head>
      <div className="board">
        {COLUMNS.map((col) => {
          const items = data.companies.filter((c: Any) => col.stages.includes(c.stage));
          return (
            <div key={col.title} className="col">
              <h3>{col.title} <span>{items.length}</span></h3>
              {items.map((c: Any) => (
                <button key={c.id} className="card" onClick={() => open(c.id)}>
                  <div className="name"><span>{c.name}</span>{c.priority && <span className={"chip " + (c.priority === "P1" ? "p1" : c.priority === "P2" ? "p2" : "")}>{c.priority}</span>}</div>
                  <div className="angle">{c.angle || c.why_now}</div>
                  <div className="row"><span className="chip stage">{STAGE_LABEL[c.stage] || c.stage}</span>{c.intersection != null && <span className="chip">fit {c.intersection}</span>}</div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Deal room (company drawer) ----------
function Room({ data, act, busy, approver, id, close, flash, load }: Any) {
  const c = data.companies.find((x: Any) => x.id === id);
  const [tab, setTab] = useState("Next step");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  if (!c) return null;
  const contacts = data.contacts.filter((x: Any) => x.company_id === id);
  const primary = contacts.find((x: Any) => x.is_primary) || contacts[0];
  const msgs = data.messages.filter((m: Any) => m.company_id === id);
  const reps = data.replies.filter((r: Any) => r.company_id === id);
  const meets = data.meetings.filter((m: Any) => m.company_id === id);
  const deal = data.deals.find((d: Any) => d.company_id === id);
  const sig = c.reasons?.signals || [];
  return (
    <>
      <div className="scrim" onClick={close} />
      <section className="drawer" role="dialog" aria-label={`${c.name} deal room`}>
        <div className="drawer-head">
          <div className="spread">
            <div><h2>{c.name}</h2><div className="row small muted" style={{ marginTop: 4 }}>{c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}</a>}<span className="chip stage">{STAGE_LABEL[c.stage] || c.stage}</span>{c.priority && <span className={"chip " + (c.priority === "P1" ? "p1" : c.priority === "P2" ? "p2" : "")}>{c.priority}</span>}{c.price_range && <span className="chip money">{c.price_range}</span>}</div></div>
            <button className="btn ghost" onClick={close} aria-label="Close">Close</button>
          </div>
          {c.angle && <p style={{ margin: "12px 0 0", maxWidth: 640 }}>{c.angle}</p>}
          <div className="tabs">{["Next step", "Research", "Decision makers", "Timeline"].map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
        </div>
        <div className="drawer-body">
          {tab === "Next step" && <NextStep c={c} primary={primary} deal={deal} meets={meets} act={act} busy={busy} approver={approver} flash={flash} data={data} />}
          {tab === "Research" && (
            <div className="grid">
              {c.our_pov != null ? <div className="panel">
                <h2>Fit from both sides</h2><p className="sub">Priority follows the lower of the two scores, so a rich brand with no audience fit cannot jump the queue.</p>
                <div className="meter"><span>Ours</span><div className="bar"><i style={{ width: `${c.our_pov}%` }} /></div><b>{c.our_pov}</b></div>
                <div className="meter theirs" style={{ marginTop: 6 }}><span>Theirs</span><div className="bar"><i style={{ width: `${c.their_pov}%` }} /></div><b>{c.their_pov}</b></div>
                <div className="grid g2" style={{ marginTop: 14 }}>
                  {["our_pov", "their_pov"].map((k) => <div key={k}><h3 style={{ fontSize: 14, marginBottom: 6 }}>{k === "our_pov" ? "Why we want them" : "Why they would say yes"}</h3>{(c.reasons?.[k]?.factors || []).map((f: Any, i: number) => <div key={i} className="small" style={{ marginBottom: 5 }}><b>{f.factor}</b> <span className="num">{f.points}/{f.max}</span><div className="muted">{f.why}</div></div>)}</div>)}
                </div>
              </div> : <div className="panel"><div className="empty"><h3>Not scored yet</h3><button className="btn" disabled={!!busy} onClick={() => act("analyze", { company_id: id }, `Scoring ${c.name}`)}>Score and find the contact</button></div></div>}
              <div className="panel">
                <h2>Signals</h2><p className="sub">Every claim and where it came from.</p>
                {sig.map((s: Any, i: number) => <div key={i} style={{ marginBottom: 8 }}>{s.claim}<span className="source">{/^https?:/.test(s.source || "") ? <a href={s.source} target="_blank" rel="noreferrer">{s.source.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}</a> : s.source}{s.date && s.date !== "unknown" ? `, ${s.date}` : ""}</span></div>)}
                {!sig.length && <span className="muted small">None yet.</span>}
                <Sources list={c.sources} />
              </div>
              {Object.values(c.role_map || {}).some(Boolean) && <div className="panel"><h2>Who moves the money</h2><dl className="kv" style={{ marginTop: 8 }}>{Object.entries(c.role_map).filter(([, v]) => v).map(([k, v]: Any) => <><dt key={k}>{k.replace("_", " ")}</dt><dd key={k + "v"}>{v}</dd></>)}</dl></div>}
            </div>
          )}
          {tab === "Decision makers" && <ContactTab contacts={contacts} act={act} busy={busy} co={c} />}
          {tab === "Timeline" && (
            <div className="panel">
              {[...msgs.map((m: Any) => ({ t: m.sent_at || m.created_at, k: "msg", m })), ...reps.map((r: Any) => ({ t: r.received_at, k: "rep", r })), ...meets.map((m: Any) => ({ t: m.start_at || m.created_at, k: "meet", m }))]
                .sort((a, b) => String(b.t).localeCompare(String(a.t)))
                .map((x: Any, i: number) => (
                  <div key={i} className="item">
                    {x.k === "msg" && <><div className="spread"><span className="mail-subject">{x.m.subject}</span><span className="row"><span className="chip">{x.m.sequence} {x.m.step}</span><span className={"chip " + (x.m.status === "sent" ? "good" : x.m.status === "cancelled" ? "bad" : "warn")}>{x.m.status}</span></span></div><div className="tiny faint">{when(x.t)} to {x.m.to_email}</div><div className="mail">{x.m.body}</div></>}
                    {x.k === "rep" && <><div className="spread"><b>Reply: {x.r.classification}</b><span className="tiny faint">{when(x.t)}</span></div><div>{x.r.summary}</div>{x.r.offer_inr ? <div className="money">Offered {inr(x.r.offer_inr)}</div> : null}</>}
                    {x.k === "meet" && <><div className="spread"><b>Meeting {x.m.n}</b><span className="tiny faint">{when(x.m.start_at)}</span></div>{x.m.meet_link && <a href={x.m.meet_link} target="_blank" rel="noreferrer">Google Meet link</a>}{x.m.digest?.summary && <p className="small">{x.m.digest.summary}</p>}</>}
                  </div>
                ))}
              {!msgs.length && !reps.length && !meets.length && <div className="empty small">Nothing yet.</div>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ---------- Decision makers: shared contact card ----------
const VLABEL: Record<string, string> = { VERIFIED: "verified", CORROBORATED: "corroborated", UNVERIFIED: "unverified", UNAVAILABLE: "not available", OUTDATED: "outdated", verified: "verified", public: "corroborated", manual: "added by you", not_found: "not available" };
const VCLASS = (s: string) => (/^(VERIFIED|verified)$/.test(s) ? "good" : /^(UNVERIFIED|OUTDATED)$/.test(s) ? "warn" : /^(UNAVAILABLE|not_found)$/.test(s) ? "" : "stage");
function VChip({ s }: Any) { return s ? <span className={"chip " + VCLASS(s)} title="MX records show the domain takes mail; they do not prove the inbox exists">{VLABEL[s] || String(s).toLowerCase()}</span> : null; }
const host = (d: string) => (d || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

function ContactCard({ ct, co, act, busy }: Any) {
  const [mail, setMail] = useState("");
  const parts: Any[] = ct.relevance_parts || [];
  const ev: Any[] = ct.evidence || [];
  const kindLabel = ct.is_primary ? "Primary" : ct.kind === "fallback" ? "Fallback" : "Alternative";
  return (
    <div className="panel dm-card">
      <div className="spread">
        <div><h2>{ct.full_name}</h2><div className="muted small">{[ct.position, ct.department].filter(Boolean).join(" · ")}</div></div>
        <div className="row"><span className={"chip " + (ct.is_primary ? "p1" : "")}>{kindLabel}</span>{ct.relevance != null && <span className="chip num">relevance {ct.relevance}/100</span>}{ct.reviewed_at && <span className="chip good">reviewed by {ct.reviewed_by}</span>}</div>
      </div>
      {ct.reason && <p style={{ margin: "10px 0 4px" }}><b>Why this person:</b> {ct.reason}</p>}
      {ct.responsibility && <p className="small" style={{ margin: "0 0 8px" }}><b>Sponsorship responsibility:</b> {ct.responsibility}</p>}
      <dl className="kv">
        <dt>Email</dt><dd>{ct.email ? <>{ct.email} <VChip s={ct.email_status} />{ct.email_type && <span className="tiny faint"> {ct.email_type}</span>}</> : <span className="muted">not available</span>}
          {(ct.email_check || []).length > 0 && <div className="tiny faint">{ct.email_check.join(" · ")}</div>}
          {/^https?:/.test(ct.email_source || "") && <span className="source"><a href={ct.email_source} target="_blank" rel="noreferrer">email source</a></span>}</dd>
        <dt>Phone</dt><dd>{ct.phone ? <>{ct.phone} <VChip s={ct.phone_status} /> <span className="tiny faint">{ct.phone_type === "switchboard" ? "company switchboard, not a direct line" : ct.phone_type}</span></> : <span className="muted">not available</span>}
          {/^https?:/.test(ct.phone_source || "") && <span className="source"><a href={ct.phone_source} target="_blank" rel="noreferrer">phone source</a></span>}</dd>
        <dt>Discovered</dt><dd>{when(ct.discovered_at || ct.created_at) || "-"}{ct.verified_at ? `, checked ${when(ct.verified_at)}` : ""}</dd>
        {ct.warm_path && <><dt>Warm path</dt><dd>{ct.warm_path}</dd></>}
      </dl>
      {parts.length > 0 && <details style={{ marginTop: 8 }}><summary>How the {ct.relevance}/100 relevance score was calculated</summary>
        <table className="score"><tbody>{parts.map((p: Any, i: number) => <tr key={i}><td>{p.factor}</td><td className="num">{p.points}/{p.max}</td><td className="muted small">{p.why}</td></tr>)}</tbody></table></details>}
      {(ev.length > 0 || (ct.context || []).length > 0) && <details style={{ marginTop: 6 }}><summary>Evidence ({ev.length || ct.context.length})</summary>
        <div style={{ marginTop: 6 }}>{ev.length ? ev.map((e: Any, i: number) => <div key={i} className="small" style={{ marginBottom: 4 }}>{e.claim}{e.date ? ` (${e.date})` : ""} <a className="source" href={e.url} target="_blank" rel="noreferrer">{host(e.url)}</a></div>)
          : (ct.context || []).map((x: string, i: number) => <div key={i} className="small">{x}</div>)}</div></details>}
      <div className="row dm-actions">
        {ct.email && <button className="btn ghost" onClick={() => copy(ct.email)}>Copy email</button>}
        {ct.phone && <button className="btn ghost" onClick={() => copy(ct.phone)}>Copy phone</button>}
        {co?.domain && <a className="btn ghost" href={`https://${host(co.domain)}`} target="_blank" rel="noreferrer">Company website</a>}
        {!ct.is_primary && <button className="btn ghost" disabled={!!busy} onClick={() => act("set_primary", { contact_id: ct.id }, "Changing the primary contact")}>Make primary</button>}
        {!ct.reviewed_at && <button className="btn ghost" disabled={!!busy} onClick={() => act("contact_reviewed", { contact_id: ct.id }, "Marking as reviewed")}>Mark reviewed</button>}
        {ct.is_primary && ct.email && <button className="btn" disabled={!!busy} onClick={() => act("prepare_outreach", { company_id: ct.company_id }, "Preparing the sponsorship offer")}>Prepare outreach</button>}
      </div>
      {!ct.email && <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="Add their professional email" value={mail} onChange={(e) => setMail(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label={`Email for ${ct.full_name}`} />
        <button className="btn" disabled={!!busy || !mail} onClick={() => act("set_email", { contact_id: ct.id, email: mail }, "Checking the email").then(() => setMail(""))}>Add email</button>
      </div>}
    </div>
  );
}

function ContactTab({ contacts, act, busy, co }: Any) {
  if (!contacts.length) return <div className="panel"><div className="empty"><h3>No decision maker yet</h3>Score the company to find the right people.</div></div>;
  const sorted = [...contacts].sort((a: Any, b: Any) => (b.is_primary - a.is_primary) || ((b.relevance ?? -1) - (a.relevance ?? -1)));
  return <div className="grid">{sorted.map((ct: Any) => <ContactCard key={ct.id} ct={ct} co={co} act={act} busy={busy} />)}
    <button className="btn ghost" disabled={!!busy} onClick={() => act("rediscover", { company_id: co.id }, `Rediscovering decision makers at ${co.name}`)}>Request rediscovery</button></div>;
}

function NextStep({ c, primary, deal, meets, act, busy, approver, data }: Any) {
  const [sim, setSim] = useState("");
  const [tpl, setTpl] = useState("first_call");
  const [slots, setSlots] = useState(nextSlots(3));
  const [start, setStart] = useState(localInput(2, 11));
  const [mins, setMins] = useState(30);
  const [notes, setNotes] = useState("");
  const tiers = data.event?.tiers || [];
  const t0 = tiers.find((t: Any) => t.name === c.tier) || tiers[0] || {};
  const [ds, setDs] = useState({ tier: t0.name || "", cash_inr: t0.price_inr || 0, deliverables: t0.deliverables || "", in_kind: "", sponsor_entity: "", sponsor_signatory: "", payment_terms: "" });
  const deck = data.decks.find((d: Any) => d.company_id === c.id);
  const lastDigest = meets.find((m: Any) => m.digest)?.digest;
  const drafted = data.messages.filter((m: Any) => m.company_id === c.id && m.status === "drafted");
  return (
    <div className="grid">
      {drafted.length > 0 && <div className="step-card" style={{ borderColor: "var(--indigo)" }}><h3>{drafted.length} email{drafted.length > 1 ? "s" : ""} waiting for your approval</h3><p className="small muted">Review them in the Outbox.</p></div>}
      {c.our_pov == null && <div className="step-card"><h3>A1 · Score this company</h3><p className="small muted">Scores both sides, finds and verifies the decision makers, writes the priced offer.</p><button className="btn" disabled={!!busy} onClick={() => act("analyze", { company_id: c.id }, `Scoring ${c.name}`)}>Score and find contact</button></div>}
      {c.our_pov != null && <div className="step-card">
        <h3>A2 · Offer and replies</h3>
        <p className="small muted">{primary?.email ? `Offer goes to ${primary.full_name} <${primary.email}>.` : primary ? `${primary.full_name} has no verified email yet: add or review it on the Decision makers tab.` : "No contact yet."}</p>
        <div className="row">
          {primary?.email && <button className="btn ghost" disabled={!!busy} onClick={() => act("analyze", { company_id: c.id }, `Re-checking ${c.name}`)}>Re-check signals</button>}
        </div>
        <label className="f">Simulate their reply (demo; marked as simulated)</label>
        <textarea value={sim} onChange={(e) => setSim(e.target.value)} placeholder="e.g. Looks interesting. We could do ₹1.5 lakh for the hackathon this quarter. Can we talk Thursday?" />
        <button className="btn ghost" disabled={!!busy || !sim || !primary} onClick={() => act("simulate", { company_id: c.id, text: sim }, "Classifying the reply").then(() => setSim(""))}>Run reply through the agents</button>
      </div>}
      {primary && <div className="step-card">
        <h3>A3 · Book a meeting</h3>
        <p className="small muted">Drafts the scheduling email in the thread. When they pick a time, confirm it: the agent creates the Google Calendar invite with a Meet link (Gemini notes on) and emails it.</p>
        <div className="grid g2">
          <div><label className="f">Template</label><select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            {[["first_call", "First call"], ["executive", "Senior executive"], ["assistant", "Via their assistant"], ["team", "Several people on their side"], ["second_meeting", "Follow-up meeting"], ["in_person", "In person"], ["reschedule", "Reschedule"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
          <div><label className="f">Slots to offer</label>{slots.map((s, i) => <input key={i} value={s} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? e.target.value : x)))} style={{ marginBottom: 4 }} />)}</div>
        </div>
        <button className="btn ghost" disabled={!!busy || !primary?.email} onClick={() => act("schedule", { company_id: c.id, template: tpl, slots }, "Drafting the scheduling email")}>Draft scheduling email</button>
        <div className="row" style={{ marginTop: 12 }}>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 220 }} aria-label="Meeting time" />
          <select value={mins} onChange={(e) => setMins(Number(e.target.value))} style={{ width: 110 }}>{[20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
          <button className="btn" disabled={!!busy || !primary?.email} onClick={() => act("confirm_meeting", { company_id: c.id, start, minutes: mins, approver }, "Booking the meeting")}>Confirm and send invite</button>
        </div>
        {meets.filter((m: Any) => m.meet_link).slice(0, 1).map((m: Any) => <p key={m.id} className="small">Booked {when(m.start_at)}: <a href={m.meet_link} target="_blank" rel="noreferrer">Meet link</a></p>)}
      </div>}
      {c.our_pov != null && <div className="step-card">
        <h3>A4 · Pitch deck for {c.name}</h3>
        <p className="small muted">8 to 10 slides about their goals, a one-pager, and a talk track for your team. The deck link is shareable with the sponsor.</p>
        <div className="row">
          <button className="btn ghost" disabled={!!busy} onClick={() => act("deck", { company_id: c.id }, `Building the ${c.name} deck`)}>{deck ? "Rebuild deck" : "Build deck"}</button>
          {deck && <a className="btn" href={`/d/${deck.id}`} target="_blank" rel="noreferrer">Open deck</a>}
          {deck && <a className="btn quiet" href={`/d/${deck.id}?team=1`} target="_blank" rel="noreferrer">Deck with talk track</a>}
        </div>
      </div>}
      {primary && <div className="step-card">
        <h3>A5 · After the meeting</h3>
        <p className="small muted">Pull the Google Meet "Take notes with Gemini" email from Gmail or paste the notes. The agent extracts goals, budget, objections and promises, drafts the recap for both sides, and raises anything below the floor.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste the Gemini notes or your own notes here" />
        <div className="row">
          <button className="btn ghost" disabled={!!busy || !data.settings.gmail} onClick={() => act("gemini_notes", { company_id: c.id }, "Looking for Gemini notes in Gmail", false).then((r: Any) => r?.text && setNotes(r.text))}>Fetch Gemini notes from Gmail</button>
          <button className="btn" disabled={!!busy || !notes} onClick={() => act("notes", { company_id: c.id, notes }, "Digesting the meeting").then(() => setNotes(""))}>Digest and draft recap</button>
        </div>
        {lastDigest && <div className="item" style={{ marginTop: 12 }}><b>Last meeting</b> <span className={"chip " + (lastDigest.temperature === "hot" ? "good" : lastDigest.temperature === "cold" ? "bad" : "warn")}>{lastDigest.temperature}</span><p className="small">{lastDigest.summary}</p>{(lastDigest.promises_by_us || []).map((p: Any, i: number) => <div key={i} className="small">We promised: {p.item} {p.due && <span className="muted">by {p.due}</span>}</div>)}</div>}
      </div>}
      {c.our_pov != null && <div className="step-card">
        <h3>A6 · MOU</h3>
        <p className="small muted">Two to three pages, from the deal sheet. Below-floor amounts go to your inbox. The MOU link is shareable.</p>
        <div className="grid g2">
          <div><label className="f">Tier</label><select value={ds.tier} onChange={(e) => { const t = tiers.find((x: Any) => x.name === e.target.value) || {}; setDs({ ...ds, tier: e.target.value, cash_inr: t.price_inr ?? ds.cash_inr, deliverables: t.deliverables ?? ds.deliverables }); }}>{tiers.map((t: Any) => <option key={t.name}>{t.name}</option>)}</select></div>
          <div><label className="f">Cash (₹, 0 for in-kind)</label><input type="number" value={ds.cash_inr} onChange={(e) => setDs({ ...ds, cash_inr: Number(e.target.value) })} /></div>
          <div><label className="f">Sponsor legal entity</label><input value={ds.sponsor_entity} onChange={(e) => setDs({ ...ds, sponsor_entity: e.target.value })} placeholder="optional" /></div>
          <div><label className="f">Sponsor signatory</label><input value={ds.sponsor_signatory} onChange={(e) => setDs({ ...ds, sponsor_signatory: e.target.value })} placeholder="optional" /></div>
        </div>
        <label className="f">Deliverables</label><textarea value={ds.deliverables} onChange={(e) => setDs({ ...ds, deliverables: e.target.value })} />
        <label className="f">In-kind from them</label><input value={ds.in_kind} onChange={(e) => setDs({ ...ds, in_kind: e.target.value })} placeholder="e.g. lunch for 2,000 attendees, valued at cost" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost" disabled={!!busy} onClick={() => act("mou", { company_id: c.id, deal: ds }, "Drafting the MOU")}>{deal ? "Redraft MOU" : "Draft MOU"}</button>
          {deal?.share_id && <a className="btn ghost" href={`/m/${deal.share_id}`} target="_blank" rel="noreferrer">Open MOU</a>}
          {deal?.share_id && primary?.email && <button className="btn" disabled={!!busy} onClick={() => act("send_mou", { company_id: c.id }, "Drafting the MOU email")}>Email MOU for signature</button>}
        </div>
      </div>}
      <div className="row small muted">Move stage by hand:
        <select value={c.stage} onChange={(e) => act("stage", { company_id: c.id, stage: e.target.value, reason: "manual" })} style={{ width: 200 }}>{Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
    </div>
  );
}

// ---------- Outbox ----------
function Outbox({ data, act, busy, flash, open, can, me }: Any) {
  const who = can("approver") ? me.name : "";
  const [edit, setEdit] = useState<Any>({});
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  const drafts = data.messages.filter((m: Any) => m.status === "drafted");
  const queued = data.messages.filter((m: Any) => ["approved", "claimed", "failed"].includes(m.status));
  const unsure = data.messages.filter((m: Any) => ["send_unknown", "needs_manual_review"].includes(m.status));
  const sent = data.messages.filter((m: Any) => m.status === "sent").slice(0, 40);
  return (
    <>
      <Head title="Outbox" sub="Nothing reaches a sponsor until a named person approves it. Follow-ups to companies that never replied are approved automatically; anything to someone who replied always waits here.">
        {!who && <span className="small muted">Your role ({me.role}) can edit drafts; an approver sends them.</span>}
        {drafts.length > 1 && <button className="btn ghost" disabled={!!busy || !who} onClick={() => act("approve_many", { keys: drafts.map((m: Any) => m.key) }, "Approving").then((r: Any) => r && flash(`Approved ${r.results.filter((x: Any) => x.ok).length} emails`))}>Approve all {drafts.length}</button>}
        <button className="btn" disabled={!!busy || !who} onClick={() => act("send", {}, "Sending approved emails").then((r: Any) => r && flash(`Sent ${r.sent}. ${(r.notes || []).join(" ")}`))}>Send approved now</button>
      </Head>
      {!data.settings.gmail && <div className="item attention" style={{ marginBottom: 14 }}><b>Draft mode.</b> Gmail is not connected, so approved emails wait here. Connect Google in Settings to send from your own mailbox.</div>}
      {unsure.map((m: Any) => (
        <div key={m.key} className="item attention">
          <div className="spread"><div className="row"><span className="chip warn">{m.status === "send_unknown" ? "checking delivery" : "needs your check"}</span><b>{coName(m.company_id)}</b><span className="muted small">to {m.to_email}</span></div><span className="tiny faint">{ago(m.created_at)}</span></div>
          <p className="small" style={{ margin: "6px 0" }}>Gmail may or may not have delivered "{m.subject}". It is never resent automatically. {m.status === "send_unknown" ? "The next daily cycle checks your Sent folder." : "Look in your Gmail Sent folder, then choose."}</p>
          {who && <div className="row"><button className="btn" disabled={!!busy} onClick={() => act("delivery", { key: m.key, outcome: "sent" }, "Marking as sent")}>It was sent</button><button className="btn ghost" disabled={!!busy} onClick={() => confirm("Send it again? Only do this if it is not in your Sent folder.") && act("delivery", { key: m.key, outcome: "resend" }, "Queuing a resend")}>Not in Sent: resend</button></div>}
        </div>
      ))}
      {drafts.map((m: Any) => {
        const e = edit[m.key];
        return (
          <div key={m.key} className="item">
            <div className="spread"><div className="row"><a href="#" onClick={(x) => { x.preventDefault(); open(m.company_id); }}><b>{coName(m.company_id)}</b></a><span className="muted small">to {m.to_email}</span><span className="chip">{m.sequence === "cold" ? (m.step === 0 ? "priced offer" : `follow-up ${m.step}`) : m.sequence}</span></div><span className="tiny faint">{ago(m.created_at)}</span></div>
            {e ? <>
              <input value={e.subject} onChange={(x) => setEdit({ ...edit, [m.key]: { ...e, subject: x.target.value } })} style={{ marginTop: 8 }} />
              <textarea style={{ minHeight: 240 }} value={e.body} onChange={(x) => setEdit({ ...edit, [m.key]: { ...e, body: x.target.value } })} />
              <div className="row"><button className="btn" onClick={() => act("edit", { key: m.key, ...e }, "Saving").then((r: Any) => { if (r?.ok) setEdit({ ...edit, [m.key]: null }); else if (r) flash((r.problems || [r.reason]).join("; ")); })}>Save (style is re-checked)</button><button className="btn ghost" onClick={() => setEdit({ ...edit, [m.key]: null })}>Cancel</button></div>
            </> : <><div className="mail-subject" style={{ marginTop: 8 }}>{m.subject}</div><div className="mail">{m.body}</div>
              <div className="row">
                <button className="btn" disabled={!!busy || !who} onClick={() => act("approve", { key: m.key }, "Approving").then((r: Any) => r && !r.ok && flash(r.reason))}>Approve</button>
                <button className="btn ghost" onClick={() => setEdit({ ...edit, [m.key]: { subject: m.subject, body: m.body } })}>Edit</button>
                {who && <button className="btn danger" disabled={!!busy} onClick={() => act("reject", { key: m.key }, "Rejecting")}>Reject</button>}
              </div></>}
          </div>
        );
      })}
      {!drafts.length && <div className="panel"><div className="empty"><h3>Nothing waiting for you</h3>The agents put every draft here before it can go out.</div></div>}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="panel"><h2>Approved, waiting to send</h2><p className="sub">Each send re-checks replies, opt-outs, caps and spacing. A second send of the same email is impossible.</p>
          {queued.map((m: Any) => <div key={m.key} className="small" style={{ marginBottom: 6 }}><span className={"chip " + (m.status === "failed" ? "bad" : "")}>{m.status}</span> <b>{coName(m.company_id)}</b> {m.subject} <span className="muted">due {when(m.scheduled_for)}</span></div>)}
          {!queued.length && <span className="muted small">Empty.</span>}</div>
        <div className="panel"><h2>Sent</h2>
          {sent.map((m: Any) => <div key={m.key} className="small" style={{ marginBottom: 6 }}><span className="muted">{when(m.sent_at)}</span> <b>{coName(m.company_id)}</b> {m.subject}</div>)}
          {!sent.length && <span className="muted small">Nothing sent yet.</span>}</div>
      </div>
    </>
  );
}

// ---------- Inbox: exceptions + replies ----------
function Inbox({ data, act, busy, flash, open, can, me }: Any) {
  const who = can("approver") ? me.name : "";
  const [ed, setEd] = useState<Any>({});
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id || "General";
  const exs = data.exceptions.filter((x: Any) => x.status === "open");
  const KIND: Record<string, string> = { below_floor: "Below your floor", no_email: "Email needed", no_contact: "No contact found", suspicious_email: "Suspicious email", reply_on_live_deal: "Reply on a live deal", unverified_email: "Unverified email", send_failed: "Send failed", meeting_exception: "From the meeting", below_floor_mou: "MOU below floor", verify_contact: "Check the contact", delivery_unknown: "Delivery uncertain", calendar_failed: "Calendar invite failed", recap_no_email: "Recap needs an email" };
  return (
    <>
      <Head title="Inbox" sub="Only the decisions a person should make: offers below your floor, exclusivity, missing emails, anything unusual. Replies from sponsors land here too.">
        {!who && <span className="small muted">Decisions here need an approver.</span>}
        <button className="btn ghost" disabled={!!busy || !data.settings.gmail} onClick={() => act("replies", {}, "Checking Gmail for replies").then((r: Any) => r && flash(`Checked ${r.checked} threads, ${r.found} new replies`))}>Check Gmail for replies</button>
      </Head>
      {exs.map((x: Any) => {
        const e = ed[x.id] || { subject: x.draft_subject, body: x.draft_body, note: "" };
        return (
          <div key={x.id} className="item attention">
            <div className="spread"><div className="row"><span className="chip warn">{KIND[x.kind] || x.kind}</span><a href="#" onClick={(v) => { v.preventDefault(); x.company_id && open(x.company_id); }}><b>{coName(x.company_id)}</b></a></div><span className="tiny faint">{ago(x.created_at)}</span></div>
            <p style={{ margin: "8px 0" }}>{x.question}</p>
            {x.recommendation && <p className="small"><b>Agent recommends:</b> {x.recommendation}</p>}
            {x.draft_body && <><input value={e.subject || ""} onChange={(v) => setEd({ ...ed, [x.id]: { ...e, subject: v.target.value } })} /><textarea style={{ minHeight: 200 }} value={e.body || ""} onChange={(v) => setEd({ ...ed, [x.id]: { ...e, body: v.target.value } })} /></>}
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" disabled={!!busy || !who} onClick={() => act("resolve", { id: x.id, action: "approve", note: e.note, subject: e.subject, body: e.body }, "Resolving").then((r: Any) => r && !r.ok && flash(JSON.stringify(r.queued?.problems || r.queued?.reason)))}>{x.draft_body ? "Approve and queue this email" : "Mark handled"}</button>
              <button className="btn ghost" disabled={!!busy || !who} onClick={() => act("resolve", { id: x.id, action: "reject", note: e.note }, "Rejecting")}>Reject</button>
              {x.company_id && <button className="btn quiet" onClick={() => open(x.company_id)}>Open deal room</button>}
            </div>
          </div>
        );
      })}
      {!exs.length && <div className="panel"><div className="empty"><h3>Nothing needs you</h3>The agents handle the rest.</div></div>}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Replies</h2><p className="sub">Classified by an isolated model with no tools, because sponsor emails are untrusted input. Any reply stops cold mail to that whole company.</p>
        {data.replies.map((r: Any) => <div key={r.id} className="small" style={{ marginBottom: 8 }}><span className="muted">{when(r.received_at)}</span> <b>{coName(r.company_id)}</b> <span className="chip">{r.classification}</span> {r.summary} {r.offer_inr ? <span className="money">{inr(r.offer_inr)}</span> : null} {String(r.gmail_id).startsWith("sim-") && <span className="chip">simulated</span>}</div>)}
        {!data.replies.length && <span className="muted small">No replies yet. You can simulate one from any deal room.</span>}
      </div>
    </>
  );
}

// ---------- Contacts DB ----------
function Contacts({ data, open }: Any) {
  const [q, setQ] = useState("");
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  const rows = data.contacts.filter((c: Any) => !q || JSON.stringify(c).toLowerCase().includes(q.toLowerCase()) || coName(c.company_id).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Head title="Contacts" sub="The database A2 builds: who they are, how to reach them, and what to say. Every row cites where it came from.">
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <a className="btn ghost" href="/api/export">Export CSV</a>
      </Head>
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Designation</th><th>Email</th><th>Phone</th><th>Relevance</th><th>One-liner</th></tr></thead>
          <tbody>{rows.map((c: Any) => (
            <tr key={c.id} className="click" onClick={() => open(c.company_id)}>
              <td><b>{c.full_name}</b>{c.iitb_alum === "yes" && <div><span className="chip good">IITB alum</span></div>}{!c.is_primary && <div className="tiny faint">{c.kind === "fallback" ? "fallback" : "alternative"}</div>}</td>
              <td>{coName(c.company_id)}</td><td>{c.position}</td>
              <td>{c.email || <span className="faint">not available</span>}{c.email && <div><VChip s={c.email_status} /></div>}</td>
              <td>{c.phone || <span className="faint">-</span>}{c.phone && <div className="tiny faint">{c.phone_type === "switchboard" ? "switchboard" : c.phone_type}</div>}</td>
              <td className="num">{c.relevance ?? "-"}</td>
              <td style={{ maxWidth: 300 }}>{c.one_liner}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <div className="empty">No contacts yet. The autopilot fills this table.</div>}
      </div>
    </>
  );
}

// ---------- Decision Makers ----------
function DecisionMakers({ data, act, busy, open }: Any) {
  const [sel, setSel] = useState<string>("");
  const [q, setQ] = useState("");
  const byCo: Record<string, Any[]> = {};
  for (const c of data.contacts) (byCo[c.company_id] ||= []).push(c);
  const rows = data.companies.filter((co: Any) => byCo[co.id]?.length && (!q || (co.name + JSON.stringify(byCo[co.id])).toLowerCase().includes(q.toLowerCase())));
  const pick = (co: Any) => byCo[co.id].find((c: Any) => c.is_primary) || byCo[co.id][0];
  const cur = rows.find((co: Any) => co.id === sel);
  return (
    <>
      <Head title="Decision Makers" sub="The right person at each company, with a professional email and business phone, how each was checked, and the evidence. Nothing is guessed: a missing detail stays missing.">
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} aria-label="Search decision makers" />
        <a className="btn ghost" href="/api/export">Export CSV</a>
      </Head>
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Company</th><th>Contact</th><th>Designation</th><th>Email</th><th>Phone</th><th>Verification</th></tr></thead>
          <tbody>{rows.map((co: Any) => { const c = pick(co); return (
            <tr key={co.id} className={"click" + (sel === co.id ? " on" : "")} onClick={() => setSel(sel === co.id ? "" : co.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(sel === co.id ? "" : co.id)}>
              <td><b>{co.name}</b><div className="tiny faint">{STAGE_LABEL[co.stage] || co.stage}</div></td>
              <td>{c.full_name}{byCo[co.id].length > 1 && <div className="tiny faint">+{byCo[co.id].length - 1} more</div>}</td>
              <td>{c.position}</td>
              <td>{c.email || <span className="faint">not available</span>}</td>
              <td>{c.phone || <span className="faint">-</span>}{c.phone_type === "switchboard" && <div className="tiny faint">switchboard</div>}</td>
              <td><div className="row" style={{ gap: 4 }}><VChip s={c.email_status} />{c.phone && <VChip s={c.phone_status} />}{c.reviewed_at && <span className="chip good">reviewed</span>}</div>{c.relevance != null && <div className="tiny faint">relevance {c.relevance}/100</div>}</td>
            </tr>); })}</tbody>
        </table>
        {!rows.length && <div className="empty"><h3>No decision makers yet</h3>Run the autopilot, or score a company from its deal room.</div>}
      </div>
      {cur && <div className="dm-detail">
        <div className="spread" style={{ margin: "18px 0 10px" }}><h2>{cur.name}</h2><div className="row"><button className="btn quiet" onClick={() => open(cur.id)}>Open deal room</button><button className="btn ghost" disabled={!!busy} onClick={() => act("rediscover", { company_id: cur.id }, `Rediscovering decision makers at ${cur.name}`)}>Request rediscovery</button></div></div>
        {cur.angle && <div className="item"><b>Outreach recommendation:</b> {cur.angle}{cur.price_range ? ` Offer ${cur.model ? cur.model.replace(/_/g, " ") + ", " : ""}${cur.price_range}.` : ""}</div>}
        <ContactTab contacts={byCo[cur.id]} act={act} busy={busy} co={cur} />
        <div className="panel" style={{ marginTop: 14 }}><h2>Previous communication</h2>
          {data.messages.filter((m: Any) => m.company_id === cur.id).slice(0, 10).map((m: Any) => <div key={m.key} className="small" style={{ marginBottom: 6 }}><span className="chip">{m.status}</span> {m.subject} <span className="muted">to {m.to_email} {when(m.sent_at || m.created_at)}</span></div>)}
          {data.replies.filter((r: Any) => r.company_id === cur.id).map((r: Any) => <div key={r.id} className="small" style={{ marginBottom: 6 }}><span className="chip">reply: {r.classification}</span> {r.summary}</div>)}
          {!data.messages.some((m: Any) => m.company_id === cur.id) && <span className="muted small">No emails yet.</span>}
        </div>
      </div>}
    </>
  );
}

// ---------- Meetings ----------
function Meetings({ data, open }: Any) {
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  return (
    <>
      <Head title="Meetings" sub="Booked by A3 with Google Meet links, digested by A5 from the Gemini notes. Open a deal room to book or digest." />
      <div className="grid g2">
        {data.meetings.map((m: Any) => (
          <div key={m.id} className="item">
            <div className="spread"><a href="#" onClick={(e) => { e.preventDefault(); open(m.company_id); }}><b>{coName(m.company_id)}</b></a><span className="chip">{m.status}</span></div>
            <div className="small muted">Meeting {m.n}{m.start_at ? `, ${when(m.start_at)}` : ""}{m.minutes ? `, ${m.minutes} min` : ""}</div>
            {m.meet_link && <a href={m.meet_link} target="_blank" rel="noreferrer">Join on Google Meet</a>}
            {m.digest && <><p className="small" style={{ marginBottom: 4 }}>{m.digest.summary}</p>
              {m.digest.budget_signal && <div className="small"><b>Budget:</b> {m.digest.budget_signal}</div>}
              {(m.digest.objections || []).length > 0 && <div className="small"><b>Objections:</b> {m.digest.objections.join("; ")}</div>}
              {(m.digest.promises_by_us || []).map((p: Any, i: number) => <div key={i} className="small"><b>We promised:</b> {p.item} {p.due && `(by ${p.due})`}</div>)}</>}
          </div>
        ))}
      </div>
      {!data.meetings.length && <div className="panel"><div className="empty"><h3>No meetings yet</h3>Book one from a deal room once a sponsor replies.</div></div>}
    </>
  );
}

// ---------- Deals ----------
function Deals({ data, open }: Any) {
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  const total = data.deals.reduce((s: number, d: Any) => s + Number(d.cash_inr || 0), 0);
  return (
    <>
      <Head title="Deals" sub={`MOUs drafted by A6. ${data.deals.length ? "Total cash in drafts: " + inr(total) + "." : ""}`} />
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table><thead><tr><th>Sponsor</th><th>Tier</th><th>Cash</th><th>In-kind</th><th>Status</th><th>MOU</th></tr></thead>
          <tbody>{data.deals.map((d: Any) => (
            <tr key={d.company_id} className="click" onClick={() => open(d.company_id)}>
              <td><b>{coName(d.company_id)}</b></td><td>{d.tier}</td><td className="money">{inr(d.cash_inr)}</td><td className="small">{d.in_kind || "-"}</td><td><span className="chip">{d.status}</span></td>
              <td>{d.share_id && <a href={`/m/${d.share_id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open</a>}</td>
            </tr>
          ))}</tbody></table>
        {!data.deals.length && <div className="empty">No MOUs yet. Draft one from a deal room.</div>}
      </div>
    </>
  );
}

// ---------- Sponsors (A7) ----------
function Sponsors({ data, act, busy, flash }: Any) {
  const [news, setNews] = useState("");
  const signed = data.companies.filter((c: Any) => ["MOU_SENT", "MOU_SIGNED", "PO_RECEIVED", "INVOICED", "PAID", "INKIND_CONFIRMED", "NURTURE"].includes(c.stage));
  return (
    <>
      <Head title="Sponsor updates" sub="Signed sponsors should feel part of the event, not just invoiced. Write what happened this fortnight once; A7 writes a personal update for each sponsor's contact." />
      <div className="panel">
        <label className="f">What happened this fortnight</label>
        <textarea style={{ minHeight: 140 }} value={news} onChange={(e) => setNews(e.target.value)} placeholder={"Registrations crossed 12,400.\nSpeaker lineup announced (Kunal Shah, Aman Gupta).\nReel featuring Acme's challenge: 48k views in 3 days, link ...\nNext: hackathon problem statements go live on 5 Dec."} />
        <div className="row" style={{ marginTop: 8 }}><button className="btn" disabled={!!busy || !news || !signed.length} onClick={() => act("nurture", { news }, "Writing sponsor updates").then((r: Any) => r && flash(`${r.drafted} updates drafted; approve them in the Outbox`))}>Write updates for {signed.length} sponsor{signed.length === 1 ? "" : "s"}</button>{!signed.length && <span className="small muted">Updates start once a sponsor reaches the MOU stage.</span>}</div>
      </div>
      <div className="panel"><h2>Signed and closing</h2>{signed.map((c: Any) => <div key={c.id} className="small" style={{ marginBottom: 6 }}><b>{c.name}</b> <span className="chip stage">{STAGE_LABEL[c.stage]}</span></div>)}{!signed.length && <span className="muted small">None yet.</span>}</div>
    </>
  );
}

// ---------- Settings ----------
function Health() {
  const [h, setH] = useState<Any>(null);
  const [run, setRun] = useState(false);
  const LABEL: Record<string, string> = { database: "Database", claude: "Claude", gemini: "Gemini (backup)", crustdata: "Crustdata", gmail: "Gmail" };
  return (
    <div className="panel">
      <div className="spread"><div><h2>Check connections</h2><p className="sub">One tiny call to each service, so you know what works before running the agents.</p></div>
        <button className="btn" disabled={run} onClick={() => { setRun(true); api("/api/health").then(setH).catch((e) => setH({ error: { ok: false, detail: e.message } })).finally(() => setRun(false)); }}>{run ? "Checking..." : "Check now"}</button></div>
      {h && Object.entries(h).map(([k, v]: Any) => (
        <div key={k} className="row" style={{ marginBottom: 6, alignItems: "flex-start" }}>
          <span className={"chip " + (v.ok ? "good" : "bad")} style={{ minWidth: 64, justifyContent: "center" }}>{v.ok ? "working" : "failing"}</span>
          <div><b>{LABEL[k] || k}</b><div className="small muted">{v.detail}</div></div>
        </div>
      ))}
    </div>
  );
}

function Settings({ data, act, flash, can }: Any) {
  const s = data.settings;
  const [nu, setNu] = useState({ email: "", name: "", role: "operator", password: "" });
  const [v, setV] = useState({ cap_new_per_day: s.cap_new_per_day, cap_total_per_day: s.cap_total_per_day, spacing_sec: s.spacing_sec, organiser_permission: s.permission });
  const [email, setEmail] = useState("");
  return (
    <>
      <Head title="Settings" sub="Connections and the rules the agents cannot break." />
      <Health />
      <div className="grid g2">
        <div className="panel">
          <h2>Connections</h2>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Model</dt><dd>{s.model} <span className={"chip " + (s.claude ? "good" : "bad")}>{s.claude ? "connected" : "key missing"}</span></dd>
            <dt>Research data</dt><dd>{s.crustdata ? <span className="chip good">Crustdata</span> : <><span className="chip warn">Live web search</span><div className="small muted">Add CRUSTDATA_API_KEY in Vercel for verified emails and firmographics.</div></>}</dd>
            <dt>Gmail + Calendar</dt><dd>{s.gmail ? <>{s.gmail} {can("admin") && <><a href="/api/google/auth">Reconnect</a> · <a href="#" onClick={(e) => { e.preventDefault(); confirm("Disconnect Google? Sending and invites stop until you reconnect.") && act("google_disconnect", {}, "Disconnecting Google"); }}>Disconnect</a></>}</> : s.googleApp ? <a className="btn" href="/api/google/auth">Connect Google</a> : <span className="small muted">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then connect.</span>}</dd>
          </dl>
        </div>
        <div className="panel">
          <h2>Rules</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Approvers: {s.approvers || "none yet"}. Approval rights come from each person's role, below.</p>
          <div className="grid g3">
            <div><label className="f">New cold emails a day</label><input value={v.cap_new_per_day} onChange={(e) => setV({ ...v, cap_new_per_day: e.target.value })} /></div>
            <div><label className="f">Total emails a day</label><input value={v.cap_total_per_day} onChange={(e) => setV({ ...v, cap_total_per_day: e.target.value })} /></div>
            <div><label className="f">Seconds between sends</label><input value={v.spacing_sec} onChange={(e) => setV({ ...v, spacing_sec: e.target.value })} /></div>
          </div>
          <label className="f">Organisers' written permission to email companies in the event's name (cold emails are held until filled)</label>
          <input value={v.organiser_permission} placeholder="e.g. E-Cell OC email, 31 Oct 2026" onChange={(e) => setV({ ...v, organiser_permission: e.target.value })} />
          <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => act("settings", v, "Saving").then((r: Any) => r && flash("Saved"))}>Save rules</button></div>
        </div>
      </div>
      {can("admin") && <div className="panel">
        <h2>People and roles</h2><p className="sub">Admin: everything, including users and connections. Approver: approves and sends emails, locks the floor, decides exceptions. Operator: runs the agents and edits drafts. Read-only: views.</p>
        <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
          {(data.users || []).map((u: Any) => <tr key={u.id}><td>{u.name}{u.disabled ? <span className="chip bad"> disabled</span> : null}</td><td>{u.email}</td>
            <td><select value={u.role} onChange={(e) => act("user_update", { id: u.id, role: e.target.value }, "Changing role")} aria-label={`Role for ${u.name}`}>{["admin", "approver", "operator", "readonly"].map((r) => <option key={r}>{r}</option>)}</select></td>
            <td className="row"><button className="btn quiet" onClick={() => act("sessions_revoke", { user_id: u.id }, "Signing out").then((r: Any) => r && flash(`${u.name} signed out everywhere`))}>Sign out everywhere</button>
              <button className="btn quiet" onClick={() => act("user_update", { id: u.id, disabled: !u.disabled }, u.disabled ? "Enabling" : "Disabling")}>{u.disabled ? "Enable" : "Disable"}</button></td></tr>)}
        </tbody></table>
        <div className="grid g3" style={{ marginTop: 12 }}>
          <input placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} aria-label="New user name" />
          <input placeholder="Work email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} aria-label="New user email" />
          <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} aria-label="New user role">{["approver", "operator", "readonly", "admin"].map((r) => <option key={r}>{r}</option>)}</select>
        </div>
        <div className="row" style={{ marginTop: 8 }}><input type="password" placeholder="Temporary password (10+ characters)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} style={{ maxWidth: 320 }} aria-label="Temporary password" />
          <button className="btn" disabled={!nu.email || !nu.name || nu.password.length < 10} onClick={() => act("user_add", nu, "Adding").then((r: Any) => { if (r) { flash(`Added ${nu.name}`); setNu({ email: "", name: "", role: "operator", password: "" }); } })}>Add person</button></div>
      </div>}
      <div className="panel">
        <h2>Start over</h2><p className="sub">Clears every company, contact, email, meeting, deck and deal, and the event brief. Settings and the Google connection stay.</p>
        <button className="btn danger" onClick={() => { const t = prompt("Type RESET to clear the desk"); if (t === "RESET") act("reset", { confirm: "RESET" }, "Clearing the desk").then((r: Any) => r && flash("Desk cleared")); }}>Reset desk</button>
      </div>
      <div className="panel">
        <h2>People and data</h2><p className="sub">Opt-outs are permanent. Erasing removes a person's details and keeps only a hash so they are never contacted again (DPDP Act 2023).</p>
        <div className="row"><input placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn ghost" disabled={!email} onClick={() => act("suppress", { email }, "Suppressing").then(() => flash("Will never be emailed"))}>Never email</button>
          <button className="btn danger" disabled={!email} onClick={() => confirm("Erase this person's data?") && act("forget", { email }, "Erasing").then((r: Any) => r && flash(`Erased ${r.erased}`))}>Erase their data</button></div>
      </div>
    </>
  );
}
