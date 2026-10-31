"use client";
import { useEffect, useMemo, useState } from "react";

type Any = any;
const TABS = ["Overview", "Brief", "Board", "Approvals", "Inbox", "Deals", "Log", "Settings"] as const;
const STAGE_ORDER = ["PROSPECT", "QUALIFIED", "CONTACT_READY", "CONTACTED", "FOLLOWUP_1", "FOLLOWUP_2", "REPLIED", "MEETING_REQUESTED", "MEETING_SCHEDULED", "MEETING_DONE", "NEGOTIATING", "MOU_DRAFTED", "MOU_SENT", "MOU_SIGNED", "PO_RECEIVED", "INVOICED", "PAID", "INKIND_CONFIRMED", "NURTURE", "DELIVERED", "REPORTED", "RENEWAL", "NO_RESPONSE", "LOST", "OPTED_OUT", "BOUNCED", "DISQUALIFIED", "PARKED"];

const EMPTY_EVENT = {
  name: "", organizer: "", dates: "", city: "", website: "", one_line: "",
  audience: "", proof: "", floor_inr: 0, goal_inr: 0, inkind_needs: "", policies: "",
  tiers: [{ name: "Title", price_inr: 0, deliverables: "" }, { name: "Gold", price_inr: 0, deliverables: "" }, { name: "Silver", price_inr: 0, deliverables: "" }],
  sender: { name: "", title: "", org: "", phone: "", email: "" }, postal_address: "",
};

async function api(path: string, body?: Any) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error("unauthorized"), { code: 401 });
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
const inr = (n: Any) => (n || n === 0 ? "INR " + Number(n).toLocaleString("en-IN") : "");
const when = (s: string) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function Page() {
  const [data, setData] = useState<Any>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    try { setData(await api("/api/state")); setAuthed(true); }
    catch (e: Any) { if (e.code === 401) setAuthed(false); else flash(e.message); }
  }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 6000); }
  async function act(label: string, body: Any, reload = true) {
    setBusy(label);
    try { const r = await api("/api/act", body); if (reload) await load(); return r; }
    catch (e: Any) { flash(e.message); return null; }
    finally { setBusy(""); }
  }
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (q) { flash(q === "connected" ? "Gmail connected" : "Gmail: " + q); window.history.replaceState({}, "", "/"); }
  }, []);

  if (authed === false) return <Login onDone={load} />;
  if (!data) return <div className="wrap muted">Loading SponsorDesk...</div>;

  const drafts = data.messages.filter((m: Any) => m.status === "drafted");
  const openEx = data.exceptions.filter((x: Any) => x.status === "open");
  const ctx = { data, act, busy, flash, load };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">SponsorDesk<small>{data.event?.name || "no event yet"}</small></div>
        <div className="row">
          <button className="ghost" disabled={!!busy} onClick={() => act("cycle", { op: "reconcile" }).then(() => api("/api/cycle", {})).then((r) => { flash(`Cycle: sent ${r?.send?.sent ?? 0}, replies ${r?.replies?.found ?? 0}`); load(); }).catch((e) => flash(e.message))}>Run daily cycle</button>
          <button className="ghost" onClick={() => api("/api/logout", {}).then(() => setAuthed(false))}>Log out</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}{t === "Approvals" && drafts.length ? <span className="badge">{drafts.length}</span> : null}{t === "Inbox" && openEx.length ? <span className="badge">{openEx.length}</span> : null}
          </button>
        ))}
      </nav>
      {busy && <div className="panel small">Working: {busy}... (research calls can take a minute or two)</div>}
      {tab === "Overview" && <Overview {...ctx} go={setTab} />}
      {tab === "Brief" && <Brief {...ctx} />}
      {tab === "Board" && <Board {...ctx} />}
      {tab === "Approvals" && <Approvals {...ctx} />}
      {tab === "Inbox" && <Inbox {...ctx} />}
      {tab === "Deals" && <Deals {...ctx} />}
      {tab === "Log" && <Log {...ctx} />}
      {tab === "Settings" && <Settings {...ctx} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ onDone }: Any) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  return (
    <div className="wrap"><div className="panel login">
      <h2>SponsorDesk</h2>
      <p className="muted small">Team password (APP_PASSWORD in Vercel).</p>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} autoFocus />
      <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={go}>Log in</button><span className="bad small">{err}</span></div>
    </div></div>
  );
  async function go() { try { await api("/api/login", { password: pw }); onDone(); } catch (e: Any) { setErr(e.message); } }
}

function Overview({ data, go }: Any) {
  const s = data.settings;
  const byStage: Record<string, number> = {};
  for (const c of data.companies) byStage[c.stage] = (byStage[c.stage] || 0) + 1;
  const sentToday = data.messages.filter((m: Any) => m.sent_at && new Date(m.sent_at).toDateString() === new Date().toDateString()).length;
  const checks = [
    [s.claude, s.provider === "gemini" ? "Gemini API key" : "Anthropic API key", s.provider === "gemini" ? "GEMINI_API_KEY in Vercel" : "ANTHROPIC_API_KEY in Vercel"],
    [s.crustdata, "Crustdata API key", "CRUSTDATA_API_KEY in Vercel (without it, no contacts are found)"],
    [!!data.event, "Event brief saved", "Brief tab"],
    [!!s.approvers, "Approvers set", "Settings tab"],
    [s.googleApp, "Google OAuth app", "GOOGLE_CLIENT_ID / SECRET in Vercel"],
    [!!s.gmail, "Gmail connected", "Settings > Connect Gmail"],
    [!!s.permission, "Organisers' written permission recorded", "Settings (cold emails are held until then)"],
  ];
  return (
    <>
      <div className="grid g4">
        <div className="panel stat"><b>{data.companies.length}</b><span>companies</span></div>
        <div className="panel stat"><b>{data.messages.filter((m: Any) => m.status === "drafted").length}</b><span>awaiting approval</span></div>
        <div className="panel stat"><b>{data.exceptions.filter((x: Any) => x.status === "open").length}</b><span>exceptions open</span></div>
        <div className="panel stat"><b>{sentToday}</b><span>sent today (cap {s.cap_total_per_day})</span></div>
      </div>
      <div className="grid g2">
        <div className="panel">
          <h2>Setup</h2>
          {checks.map(([ok, name, how]: Any) => (
            <div key={name} className="row small" style={{ justifyContent: "space-between" }}>
              <span>{ok ? <span className="good">ready</span> : <span className="warn">todo</span>} {name}</span>{!ok && <span className="muted">{how}</span>}
            </div>
          ))}
          <p className="small muted">Model: {s.model} ({s.provider})</p>
        </div>
        <div className="panel">
          <h2>Pipeline</h2>
          {STAGE_ORDER.filter((st) => byStage[st]).map((st) => (
            <div key={st} className="row small" style={{ justifyContent: "space-between" }}><span className="mono">{st}</span><b>{byStage[st]}</b></div>
          ))}
          {!data.companies.length && <p className="muted small">No companies yet. Save the brief, then use Board &gt; Find sponsors.</p>}
          <div className="row" style={{ marginTop: 10 }}><button className="ghost" onClick={() => go("Board")}>Open board</button></div>
        </div>
      </div>
      <div className="panel">
        <h2>Latest decisions</h2>
        {data.log.filter((l: Any) => ["decision", "reply", "sent", "exception_approve"].includes(l.action)).slice(0, 12).map((l: Any) => (
          <div key={l.id} className="small"><span className="muted">{when(l.ts)}</span> <span className="chip">{l.action}</span> <b>{l.company_id}</b> {l.detail}</div>
        ))}
      </div>
    </>
  );
}

function Brief({ data, act }: Any) {
  const [e, setE] = useState<Any>(data.event || EMPTY_EVENT);
  const set = (k: string, v: Any) => setE({ ...e, [k]: v });
  const setS = (k: string, v: Any) => setE({ ...e, sender: { ...e.sender, [k]: v } });
  const setT = (i: number, k: string, v: Any) => setE({ ...e, tiers: e.tiers.map((t: Any, j: number) => (j === i ? { ...t, [k]: v } : t)) });
  const F = (k: string, label: string, ph = "", area = false) => (
    <div><label>{label}</label>{area ? <textarea value={e[k] || ""} placeholder={ph} onChange={(x) => set(k, x.target.value)} /> : <input value={e[k] || ""} placeholder={ph} onChange={(x) => set(k, x.target.value)} />}</div>
  );
  return (
    <div className="panel">
      <h2>Event brief (A0)</h2>
      <p className="small muted">Every agent reads this. Only put numbers you can prove; the agents never invent event numbers.</p>
      <div className="grid g2">
        {F("name", "Event", "E-Summit 2027")}{F("organizer", "Organiser", "E-Cell, IIT Bombay")}
        {F("dates", "Dates", "23-25 Jan 2027")}{F("city", "City / venue", "IIT Bombay, Mumbai")}
        {F("website", "Website", "https://...")}{F("one_line", "One line", "What the event is, in one true sentence")}
      </div>
      {F("audience", "Audience facts with sources", "e.g. 8,200 unique attendees (gate scans, 2026); 62% final-year engineering; 210 startups at expo (expo list)", true)}
      {F("proof", "Proof available", "e.g. 2026 partner X got 1,100 applications (their report); Instagram reach screenshot Feb 2026", true)}
      <h3>Tiers</h3>
      {e.tiers.map((t: Any, i: number) => (
        <div key={i} className="grid g2" style={{ gridTemplateColumns: "1fr 1fr 3fr auto" }}>
          <input value={t.name} onChange={(x) => setT(i, "name", x.target.value)} placeholder="Tier" />
          <input type="number" value={t.price_inr} onChange={(x) => setT(i, "price_inr", Number(x.target.value))} placeholder="Price INR" />
          <input value={t.deliverables} onChange={(x) => setT(i, "deliverables", x.target.value)} placeholder="Deliverables" />
          <button className="ghost" onClick={() => set("tiers", e.tiers.filter((_: Any, j: number) => j !== i))}>x</button>
        </div>
      ))}
      <button className="ghost" style={{ marginTop: 6 }} onClick={() => set("tiers", [...e.tiers, { name: "", price_inr: 0, deliverables: "" }])}>Add tier</button>
      <div className="grid g2">
        <div><label>Floor INR (smallest cash deal without approval; base it on last year's closes)</label><input type="number" value={e.floor_inr} onChange={(x) => set("floor_inr", Number(x.target.value))} /></div>
        <div><label>Revenue goal INR</label><input type="number" value={e.goal_inr} onChange={(x) => set("goal_inr", Number(x.target.value))} /></div>
      </div>
      {F("inkind_needs", "In-kind needs (what you would otherwise pay for)", "Lunch for 2,000 x 2 days; prizes; cloud credits for 200 startups; internships for winners", true)}
      {F("policies", "Policies", "Never sell judging; resume data only with opt-in; exclusivity only at Title", true)}
      <h3>Sender and signature</h3>
      <div className="grid g2">
        {["name", "title", "org", "phone", "email"].map((k) => <div key={k}><label>{k}</label><input value={e.sender?.[k] || ""} onChange={(x) => setS(k, x.target.value)} /></div>)}
        {F("postal_address", "Postal address (printed on every cold email)", "E-Cell, IIT Bombay, Powai, Mumbai 400076")}
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={() => api("/api/event", { profile: e }).then(() => location.reload()).catch((x: Any) => alert(x.message))}>Save brief</button></div>
    </div>
  );
}

function Bar({ v }: Any) { return <div className="bar" title={String(v ?? "")}><i style={{ width: `${Math.max(0, Math.min(100, v || 0))}%` }} /></div>; }

function Board({ data, act, busy, flash }: Any) {
  const [count, setCount] = useState(10);
  const [open, setOpen] = useState<string>("");
  const [manual, setManual] = useState({ name: "", domain: "", note: "" });
  const [progress, setProgress] = useState("");
  const contacts = useMemo(() => Object.fromEntries(data.contacts.map((c: Any) => [c.company_id, c])), [data.contacts]);
  async function analyzeAll() {
    const todo = data.companies.filter((c: Any) => c.stage === "PROSPECT");
    for (let i = 0; i < todo.length; i++) {
      setProgress(`Analyzing ${i + 1}/${todo.length}: ${todo[i].name}`);
      await act(`analyzing ${todo[i].name}`, { op: "analyze", company_id: todo[i].id }, i === todo.length - 1);
    }
    setProgress(""); flash("Analysis done. Drafts are in Approvals.");
  }
  return (
    <>
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Sponsor board (A1 + A2)</h2>
          <input type="number" value={count} min={3} max={30} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 80 }} />
          <button className="btn" disabled={!!busy || !data.event} onClick={() => act("finding sponsors with Crustdata", { op: "discover", count }).then((r: Any) => r && flash(`Added ${r.added} companies (${r.toolCalls} Crustdata calls)`))}>Find sponsors</button>
          <button className="ghost" disabled={!!busy} onClick={analyzeAll}>Analyze all new</button>
          <span className="small muted">{progress}</span>
        </div>
        <details style={{ marginTop: 8 }}><summary className="small muted">Add a company by hand (last year's sponsors first)</summary>
          <div className="grid g4" style={{ marginTop: 6 }}>
            <input placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <input placeholder="domain.com" value={manual.domain} onChange={(e) => setManual({ ...manual, domain: e.target.value })} />
            <input placeholder="Note (e.g. sponsored 2026, POC Priya)" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} />
            <button className="ghost" onClick={() => act("adding", { op: "add_company", ...manual }).then(() => setManual({ name: "", domain: "", note: "" }))}>Add</button>
          </div>
        </details>
      </div>
      <div className="panel scroll">
        <table>
          <thead><tr><th>#</th><th>Company</th><th>Stage</th><th>Ours</th><th>Theirs</th><th>Fit</th><th>Model / price</th><th>Why</th><th></th></tr></thead>
          <tbody>
            {data.companies.map((c: Any, i: number) => {
              const ct = contacts[c.id];
              return [
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td><b>{c.name}</b><div className="small muted">{c.domain} {c.segment && <span className="chip">{c.segment}</span>}</div></td>
                  <td><span className="mono small">{c.stage}</span>{c.priority && <div><span className={"chip " + (c.priority === "P1" ? "p1" : "")}>{c.priority}</span></div>}</td>
                  <td style={{ width: 70 }}>{c.our_pov ?? ""}<Bar v={c.our_pov} /></td>
                  <td style={{ width: 70 }}>{c.their_pov ?? ""}<Bar v={c.their_pov} /></td>
                  <td><b>{c.intersection ?? ""}</b></td>
                  <td className="small">{c.model}<div>{c.price_range}</div></td>
                  <td className="small" style={{ maxWidth: 320 }}>{c.angle || c.why_now}{(c.decision || "").startsWith("drop") && <div className="bad">{c.decision}</div>}</td>
                  <td className="row">
                    <button className="ghost" disabled={!!busy} onClick={() => act(`analyzing ${c.name}`, { op: "analyze", company_id: c.id })}>{c.our_pov == null ? "Analyze" : "Re-check"}</button>
                    <button className="ghost" onClick={() => setOpen(open === c.id ? "" : c.id)}>{open === c.id ? "Hide" : "Reasons"}</button>
                  </td>
                </tr>,
                open === c.id && (
                  <tr key={c.id + "x"}><td></td><td colSpan={8}>
                    <div className="grid g2">
                      <div>
                        <h3>Signals (every decision cites its reasons)</h3>
                        {(c.reasons?.signals || []).map((s: Any, k: number) => <div key={k} className="small">{s.claim} <span className="muted">{[s.source, s.field, s.value, s.date].filter(Boolean).join(" | ")}</span></div>)}
                        <h3>Our POV</h3>{(c.reasons?.our_pov?.factors || []).map((f: Any, k: number) => <div key={k} className="small">{f.factor}: {f.points}/{f.max} <span className="muted">{f.why}</span></div>)}
                        <h3>Their POV</h3>{(c.reasons?.their_pov?.factors || []).map((f: Any, k: number) => <div key={k} className="small">{f.factor}: {f.points}/{f.max} <span className="muted">{f.why}</span></div>)}
                      </div>
                      <div>
                        <h3>Contact</h3>
                        {ct ? <div className="small"><b>{ct.full_name}</b>, {ct.position}<div>{ct.email} <span className={ct.email_status === "verified" ? "good" : "warn"}>{ct.email_status}</span></div><div className="muted">{ct.one_liner}</div>{(ct.context || []).map((x: string, k: number) => <div key={k}>- {x}</div>)}{ct.linkedin_url && <a href={ct.linkedin_url} target="_blank">LinkedIn</a>}{ct.iitb_alum === "yes" && <span className="chip">IITB alum</span>}</div> : <div className="small muted">none yet</div>}
                        <h3>Who moves the money</h3>
                        {Object.entries(c.role_map || {}).filter(([, v]) => v).map(([k, v]: Any) => <div key={k} className="small"><span className="chip">{k}</span>{v}</div>)}
                        <h3>Audience benefit</h3><div className="small">{c.audience_benefit}</div>
                      </div>
                    </div>
                  </td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
        {!data.companies.length && <p className="muted">Nothing yet. Save the brief, then Find sponsors.</p>}
      </div>
    </>
  );
}

function approverPick(data: Any) { return (data.settings.approvers || "").split(",").map((s: string) => s.trim()).filter(Boolean); }

function Approvals({ data, act, busy, flash }: Any) {
  const names = approverPick(data);
  const [who, setWho] = useState(names[0] || "");
  const [edit, setEdit] = useState<Any>({});
  const drafts = data.messages.filter((m: Any) => m.status === "drafted");
  const queued = data.messages.filter((m: Any) => ["approved", "claimed", "failed"].includes(m.status));
  const sent = data.messages.filter((m: Any) => m.status === "sent").slice(0, 30);
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  return (
    <>
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Waiting for approval ({drafts.length})</h2>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 180 }}>{names.length ? names.map((n: string) => <option key={n}>{n}</option>) : <option value="">set approvers in Settings</option>}</select>
          {drafts.length > 1 && <button className="ghost" disabled={!!busy || !who} onClick={() => act("approving all", { op: "approve_many", keys: drafts.map((m: Any) => m.key), approver: who }).then((r: Any) => r && flash(`Approved ${r.results.filter((x: Any) => x.ok).length}`))}>Approve all shown</button>}
        </div>
        <p className="small muted">Nothing reaches a sponsor until a person approves it here. Follow-ups to companies that never replied are approved automatically; anything to someone who replied always waits for you.</p>
        {drafts.map((m: Any) => {
          const e = edit[m.key];
          return (
            <div key={m.key} className="panel">
              <div className="row small"><b>{coName(m.company_id)}</b><span className="muted">to {m.to_email}</span><span className="chip">{m.sequence} {m.step}</span></div>
              {e ? (
                <>
                  <input value={e.subject} onChange={(x) => setEdit({ ...edit, [m.key]: { ...e, subject: x.target.value } })} />
                  <textarea style={{ minHeight: 220, fontFamily: "var(--mono)" }} value={e.body} onChange={(x) => setEdit({ ...edit, [m.key]: { ...e, body: x.target.value } })} />
                  <div className="row"><button className="btn" onClick={() => act("saving", { op: "edit", key: m.key, ...e }).then((r: Any) => { if (r?.ok) setEdit({ ...edit, [m.key]: null }); else if (r) flash((r.problems || [r.reason]).join("; ")); })}>Save (re-checks style)</button><button className="ghost" onClick={() => setEdit({ ...edit, [m.key]: null })}>Cancel</button></div>
                </>
              ) : (
                <><div><b>{m.subject}</b></div><pre className="mail">{m.body}</pre></>
              )}
              {!e && <div className="row">
                <button className="btn" disabled={!!busy || !who} onClick={() => act("approving", { op: "approve", key: m.key, approver: who }).then((r: Any) => r && !r.ok && flash(r.reason))}>Approve</button>
                <button className="ghost" onClick={() => setEdit({ ...edit, [m.key]: { subject: m.subject, body: m.body } })}>Edit</button>
                <button className="ghost" onClick={() => act("rejecting", { op: "reject", key: m.key, approver: who })}>Reject</button>
              </div>}
            </div>
          );
        })}
      </div>
      <div className="panel">
        <div className="row"><h2 style={{ margin: 0 }}>Approved, waiting to send ({queued.length})</h2>
          <button className="btn" disabled={!!busy} onClick={() => act("sending", { op: "send" }).then((r: Any) => r && flash(`Sent ${r.sent}. ${(r.notes || []).join(" ")}`))}>Send due now</button></div>
        <p className="small muted">Sending checks replies, the suppression list, daily caps and spacing first. A second send of the same email is impossible.</p>
        {queued.map((m: Any) => <div key={m.key} className="small row"><span className="chip">{m.status}</span><b>{coName(m.company_id)}</b> {m.subject} <span className="muted">due {when(m.scheduled_for)}</span> {m.approved_by && <span className="muted">by {m.approved_by}</span>}</div>)}
      </div>
      <div className="panel">
        <h2>Sent</h2>
        {sent.map((m: Any) => <div key={m.key} className="small"><span className="muted">{when(m.sent_at)}</span> <b>{coName(m.company_id)}</b> {m.subject} <span className="chip">{m.sequence} {m.step}</span></div>)}
      </div>
    </>
  );
}

function Inbox({ data, act, busy, flash }: Any) {
  const names = approverPick(data);
  const [who, setWho] = useState(names[0] || "");
  const [sim, setSim] = useState({ company_id: "", text: "" });
  const [ed, setEd] = useState<Any>({});
  const coName = (id: string) => data.companies.find((c: Any) => c.id === id)?.name || id;
  const open = data.exceptions.filter((x: Any) => x.status === "open");
  const withContact = data.companies.filter((c: Any) => data.contacts.some((k: Any) => k.company_id === c.id));
  return (
    <>
      <div className="panel">
        <div className="row"><h2 style={{ margin: 0 }}>Exceptions: humans decide ({open.length})</h2>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 180 }}>{names.map((n: string) => <option key={n}>{n}</option>)}</select></div>
        {open.map((x: Any) => {
          const e = ed[x.id] || { subject: x.draft_subject, body: x.draft_body, note: "" };
          return (
            <div key={x.id} className="panel">
              <div className="row small"><span className="chip">{x.kind}</span><b>{coName(x.company_id)}</b><span className="muted">{when(x.created_at)}</span></div>
              <p>{x.question}</p>
              {x.recommendation && <p className="small"><b>Agent recommends:</b> {x.recommendation}</p>}
              {x.draft_body && <>
                <input value={e.subject || ""} onChange={(v) => setEd({ ...ed, [x.id]: { ...e, subject: v.target.value } })} />
                <textarea style={{ minHeight: 180, fontFamily: "var(--mono)" }} value={e.body || ""} onChange={(v) => setEd({ ...ed, [x.id]: { ...e, body: v.target.value } })} />
              </>}
              <input placeholder="Note (optional)" value={e.note} onChange={(v) => setEd({ ...ed, [x.id]: { ...e, note: v.target.value } })} />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" disabled={!!busy || !who} onClick={() => act("resolving", { op: "resolve", id: x.id, action: "approve", approver: who, note: e.note, subject: e.subject, body: e.body }).then((r: Any) => r && !r.ok && flash(JSON.stringify(r.queued?.problems || r.queued?.reason)))}>{x.draft_body ? "Approve and queue email" : "Mark handled"}</button>
                <button className="ghost" onClick={() => act("rejecting", { op: "resolve", id: x.id, action: "reject", approver: who, note: e.note })}>Reject</button>
              </div>
            </div>
          );
        })}
        {!open.length && <p className="muted small">Nothing needs you right now.</p>}
      </div>
      <div className="panel">
        <div className="row"><h2 style={{ margin: 0 }}>Replies</h2>
          <button className="btn" disabled={!!busy || !data.settings.gmail} onClick={() => act("checking Gmail", { op: "replies" }).then((r: Any) => r && flash(`Checked ${r.checked} threads, ${r.found} new`))}>Check Gmail</button></div>
        <p className="small muted">Replies are classified by an isolated model with no tools: sponsor emails are untrusted input. A reply stops all cold mail to that company.</p>
        {data.replies.map((r: Any) => <div key={r.id} className="small"><span className="muted">{when(r.received_at)}</span> <b>{coName(r.company_id)}</b> <span className="chip">{r.classification}</span> {r.summary} {r.offer_inr ? <b>{inr(r.offer_inr)}</b> : null} {String(r.gmail_id).startsWith("sim-") && <span className="chip">simulated</span>}</div>)}
      </div>
      <div className="panel">
        <h2>Simulate a reply (demo)</h2>
        <p className="small muted">Marked as simulated everywhere. Runs the same pipeline as a real reply.</p>
        <select value={sim.company_id} onChange={(e) => setSim({ ...sim, company_id: e.target.value })}><option value="">Pick a company with a contact</option>{withContact.map((c: Any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <textarea placeholder="e.g. Interesting. We can do INR 1.5 lakh for the hackathon, not more this quarter." value={sim.text} onChange={(e) => setSim({ ...sim, text: e.target.value })} />
        <button className="ghost" disabled={!!busy || !sim.company_id || !sim.text} onClick={() => act("classifying reply", { op: "simulate", ...sim }).then((r: Any) => r && flash(`Classified: ${r.result?.label}`))}>Run</button>
      </div>
    </>
  );
}

function Deals({ data, act, busy }: Any) {
  const [cid, setCid] = useState("");
  const tiers = data.event?.tiers || [];
  const [deal, setDeal] = useState<Any>({ tier: tiers[0]?.name || "", cash_inr: tiers[0]?.price_inr || 0, in_kind: "", deliverables: tiers[0]?.deliverables || "", sponsor_entity: "", sponsor_signatory: "", payment_terms: "" });
  const existing = data.deals.find((d: Any) => d.company_id === cid);
  const candidates = data.companies.filter((c: Any) => !["PROSPECT", "DISQUALIFIED"].includes(c.stage));
  const md = existing?.mou || "";
  return (
    <div className="panel">
      <h2>Deal sheet and MOU (A6)</h2>
      <select value={cid} onChange={(e) => setCid(e.target.value)}><option value="">Pick a company</option>{candidates.map((c: Any) => <option key={c.id} value={c.id}>{c.name} ({c.stage})</option>)}</select>
      <div className="grid g2">
        <div><label>Tier</label><select value={deal.tier} onChange={(e) => { const t = tiers.find((x: Any) => x.name === e.target.value); setDeal({ ...deal, tier: e.target.value, cash_inr: t?.price_inr ?? deal.cash_inr, deliverables: t?.deliverables ?? deal.deliverables }); }}>{tiers.map((t: Any) => <option key={t.name}>{t.name}</option>)}</select></div>
        <div><label>Cash INR (0 for in-kind only)</label><input type="number" value={deal.cash_inr} onChange={(e) => setDeal({ ...deal, cash_inr: Number(e.target.value) })} /></div>
        <div><label>Sponsor legal entity</label><input value={deal.sponsor_entity} onChange={(e) => setDeal({ ...deal, sponsor_entity: e.target.value })} /></div>
        <div><label>Sponsor signatory</label><input value={deal.sponsor_signatory} onChange={(e) => setDeal({ ...deal, sponsor_signatory: e.target.value })} /></div>
      </div>
      <label>Deliverables (exactly as agreed)</label><textarea value={deal.deliverables} onChange={(e) => setDeal({ ...deal, deliverables: e.target.value })} />
      <label>In-kind from sponsor (item, quantity, value at cost avoided)</label><textarea value={deal.in_kind} onChange={(e) => setDeal({ ...deal, in_kind: e.target.value })} />
      <label>Payment terms</label><input value={deal.payment_terms} placeholder="50% within 15 days of PO, 50% 15 days before event" onChange={(e) => setDeal({ ...deal, payment_terms: e.target.value })} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" disabled={!cid || !!busy} onClick={() => act("drafting MOU", { op: "mou", company_id: cid, deal })}>Draft MOU</button>
        {md && <button className="ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = `MOU-${cid}.md`; a.click(); }}>Download .md</button>}
      </div>
      {md && <pre className="mail">{md}</pre>}
      <p className="small muted">Draft only: the institute's office reviews it, and the event's authorised signatory signs. Send it from the Approvals flow after review.</p>
    </div>
  );
}

function Log({ data }: Any) {
  return (
    <div className="panel scroll">
      <h2>Decision log</h2>
      <table><thead><tr><th>When</th><th>Who</th><th>Company</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{data.log.map((l: Any) => <tr key={l.id}><td className="small muted">{when(l.ts)}</td><td className="small">{l.actor}</td><td className="small">{l.company_id}</td><td><span className="chip">{l.action}</span>{l.to_stage && <span className="mono small"> {l.from_stage} to {l.to_stage}</span>}</td><td className="small">{l.detail}</td></tr>)}</tbody></table>
    </div>
  );
}

function Settings({ data, act, flash }: Any) {
  const s = data.settings;
  const [v, setV] = useState({ approvers: s.approvers, cap_new_per_day: s.cap_new_per_day, cap_total_per_day: s.cap_total_per_day, spacing_sec: s.spacing_sec, organiser_permission: s.permission });
  const [email, setEmail] = useState("");
  return (
    <>
      <div className="panel">
        <h2>Gmail</h2>
        {s.gmail ? <p>Connected as <b>{s.gmail}</b>. <a href="/api/google/auth">Reconnect</a></p> : s.googleApp ? <p><a className="btn" href="/api/google/auth" style={{ textDecoration: "none", padding: "8px 14px", borderRadius: 7, background: "var(--accent)", color: "var(--accent-ink)" }}>Connect Gmail</a></p> : <p className="warn">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then reload.</p>}
        <p className="small muted">Without Gmail the app runs in draft mode: approved emails wait in the queue and you can copy them.</p>
      </div>
      <div className="panel">
        <h2>Rules</h2>
        <label>Approvers (comma-separated names; only these can approve emails and exceptions)</label><input value={v.approvers} onChange={(e) => setV({ ...v, approvers: e.target.value })} />
        <div className="grid g4">
          <div><label>New cold emails per day</label><input value={v.cap_new_per_day} onChange={(e) => setV({ ...v, cap_new_per_day: e.target.value })} /></div>
          <div><label>Total emails per day</label><input value={v.cap_total_per_day} onChange={(e) => setV({ ...v, cap_total_per_day: e.target.value })} /></div>
          <div><label>Seconds between sends</label><input value={v.spacing_sec} onChange={(e) => setV({ ...v, spacing_sec: e.target.value })} /></div>
        </div>
        <label>Organisers' written permission to email companies in the event's name (who, when). Cold emails are held until this is filled.</label>
        <input value={v.organiser_permission} placeholder="e.g. E-Cell OC email from X, 31 Oct 2026" onChange={(e) => setV({ ...v, organiser_permission: e.target.value })} />
        <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => act("saving", { op: "settings", ...v }).then((r: Any) => r && flash("Saved"))}>Save</button></div>
      </div>
      <div className="panel">
        <h2>People and data (DPDP)</h2>
        <input placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" disabled={!email} onClick={() => act("suppressing", { op: "suppress", email }).then(() => flash("Will never be emailed"))}>Never email</button>
          <button className="ghost" disabled={!email} onClick={() => confirm("Erase this person's data?") && act("erasing", { op: "forget", email }).then((r: Any) => r && flash(`Erased ${r.erased}`))}>Erase their data</button>
        </div>
      </div>
    </>
  );
}
