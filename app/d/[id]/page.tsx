"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Any = any;

const LABEL: Record<string, string> = {
  goal: "Your goal", audience: "Who you reach", idea: "The idea", deliverables: "What you get", measurement: "How it is measured",
  proof: "Proof", options: "Ways to partner", timeline: "Timeline", next: "Next step",
};

/** "Gold: INR 3 lakh, stage slot" -> ["Gold", "INR 3 lakh, stage slot"] */
function split(s: string): [string, string] {
  const i = s.indexOf(":");
  return i > 0 && i < 40 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : ["", s];
}

function Body({ s }: { s: Any }) {
  const items: string[] = (s.body || []).filter(Boolean);
  const kind = s.kind;
  if (kind === "deliverables" && items.length > 1) {
    return <ol className="dk-grid">{items.map((b, j) => { const [t, r] = split(b); return <li key={j}><span className="dk-n">{String(j + 1).padStart(2, "0")}</span>{t && <b>{t}</b>}<span>{r}</span></li>; })}</ol>;
  }
  if (kind === "options" && items.length > 1) {
    const rec = items.length === 3 ? 1 : -1;
    return <div className="dk-opts">{items.map((b, j) => { const [t, r] = split(b); return <div key={j} className={"dk-opt" + (j === rec ? " rec" : "")}>{j === rec && <span className="dk-tag">Recommended</span>}<b>{t || `Option ${j + 1}`}</b><p>{r}</p></div>; })}</div>;
  }
  if (kind === "timeline" && items.length > 1) {
    return <ol className="dk-time">{items.map((b, j) => { const [t, r] = split(b); return <li key={j}><i aria-hidden /><b>{t || `Step ${j + 1}`}</b><span>{r}</span></li>; })}</ol>;
  }
  if (kind === "idea" || kind === "goal") {
    return <div className="dk-lead">{items.map((b, j) => <p key={j} className={j === 0 ? "first" : ""}>{b}</p>)}</div>;
  }
  return items.length ? <ul className="dk-list">{items.map((b, j) => <li key={j}>{b}</li>)}</ul> : null;
}

export default function DeckPage() {
  const { id } = useParams() as { id: string };
  const team = useSearchParams()?.get("team") === "1";
  const [deck, setDeck] = useState<Any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const url = team ? `/api/deck?id=${id}` : `/api/public?kind=deck&id=${id}`;
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then((j) => (j.error ? setErr(j.error === "unauthorized" ? "Log in to SponsorDesk to see the talk track." : "This deck is not available.") : setDeck(j))).catch(() => setErr("This deck is not available."));
  }, [id, team]);
  if (err) return <div className="deck"><p className="deck-msg">{err}</p></div>;
  if (!deck) return <div className="deck"><p className="deck-msg">Loading the deck…</p></div>;
  const ev = deck.event || {};
  const slides: Any[] = deck.slides || [];
  const total = slides.length + (deck.one_pager ? 1 : 0);
  const meta = [ev.dates, ev.city].filter(Boolean).join(" · ");

  return (
    <div className="deck">
      <header className="deck-bar noprint">
        <span><b>{deck.company}</b> × {ev.name}</span>
        <button className="btn ghost" onClick={() => window.print()}>Save as PDF</button>
      </header>

      {slides.map((s, i) => {
        const cover = i === 0 || s.kind === "cover";
        const dark = cover || s.kind === "next";
        const hasStat = !!s.stat && !cover;
        return (
          <div key={i} className="dk-wrap">
            <section className={`dk dk-${cover ? "cover" : s.kind}${dark ? " dark" : ""}${hasStat ? " has-stat" : ""}`} aria-label={`Slide ${i + 1} of ${total}`}>
              {cover ? (
                <>
                  <div className="dk-pair"><span>{deck.company}</span><em aria-hidden>×</em><span>{ev.name}</span></div>
                  <h1>{s.heading || deck.title}</h1>
                  <p className="dk-thesis">{(s.body || []).join(" ") || deck.thesis}</p>
                  <footer><span>{ev.organizer}</span><span>{meta}</span></footer>
                </>
              ) : (
                <>
                  <div className="dk-kicker"><span>{String(i + 1).padStart(2, "0")}</span>{LABEL[s.kind] || ""}</div>
                  <div className="dk-main">
                    <div className="dk-text">
                      <h2>{s.heading}</h2>
                      <Body s={s} />
                    </div>
                    {hasStat && <div className="dk-stat"><b>{s.stat}</b>{s.stat_label && <span>{s.stat_label}</span>}</div>}
                  </div>
                  <footer><span>{ev.name}{deck.company ? ` for ${deck.company}` : ""}</span><span>{i + 1} / {total}</span></footer>
                </>
              )}
            </section>
            {team && s.notes && <div className="dk-notes noprint"><b>Speaker notes</b>{s.notes}</div>}
          </div>
        );
      })}

      {deck.one_pager && (
        <div className="dk-wrap">
          <section className="dk dk-onepager" aria-label="One-page summary">
            <div className="dk-kicker"><span>{String(total).padStart(2, "0")}</span>On one page</div>
            <h2>{deck.one_pager.headline}</h2>
            <ul className="dk-list cols">{(deck.one_pager.bullets || []).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
            {deck.one_pager.ask && <div className="dk-ask"><b>Next step</b><span>{deck.one_pager.ask}</span></div>}
            <footer><span>{ev.organizer}</span><span>{total} / {total}</span></footer>
          </section>
        </div>
      )}

      {team && deck.talk_track && (
        <article className="doc noprint dk-talk">
          <h1>Talk track <small>team only</small></h1>
          <h2>Opening</h2><p>{deck.talk_track.opening}</p>
          <h2>Discovery questions</h2><ol>{(deck.talk_track.discovery || []).map((q: string, i: number) => <li key={i}>{q}</li>)}</ol>
          <h2>Pitch</h2><p>{deck.talk_track.pitch}</p>
          <h2>Objections</h2>{(deck.talk_track.objections || []).map((o: Any, i: number) => <p key={i}><b>{o.they}</b><br />{o.we}</p>)}
          <h2>Close</h2><p>{deck.talk_track.close}</p>
        </article>
      )}
    </div>
  );
}
