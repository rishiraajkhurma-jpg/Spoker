"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Any = any;

export default function DeckPage() {
  const { id } = useParams() as { id: string };
  const team = useSearchParams()?.get("team") === "1";
  const [deck, setDeck] = useState<Any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const url = team ? `/api/deck?id=${id}` : `/api/public?kind=deck&id=${id}`;
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then((j) => (j.error ? setErr(j.error === "unauthorized" ? "Log in to SponsorDesk to see the talk track." : "This deck is not available.") : setDeck(j))).catch(() => setErr("This deck is not available."));
  }, [id, team]);
  if (err) return <div className="deck"><div className="deck-bar">{err}</div></div>;
  if (!deck) return <div className="deck"><div className="deck-bar">Loading...</div></div>;
  const ev = deck.event || {};
  return (
    <div className="deck">
      <div className="deck-bar"><span>{deck.company} x {ev.name}</span><button className="btn ghost noprint" onClick={() => window.print()}>Save as PDF</button></div>
      {(deck.slides || []).map((s: Any, i: number) => (
        <div key={i}>
          <section className={"slide" + (s.kind === "cover" || i === 0 ? " cover" : "")}>
            {i === 0 || s.kind === "cover" ? (
              <>
                <div className="k" style={{ color: "#9fb0ff" }}>{deck.company} x {ev.name}</div>
                <h2>{s.heading || deck.title}</h2>
                <p>{(s.body || []).join(" ") || deck.thesis}</p>
                <div className="foot" style={{ color: "#7f93ad" }}><span>{ev.organizer}</span><span>{ev.dates}{ev.city ? `, ${ev.city}` : ""}</span></div>
              </>
            ) : (
              <>
                <div className="k">{String(i + 1).padStart(2, "0")} / {deck.slides.length}</div>
                <h2>{s.heading}</h2>
                {(s.body || []).length > 0 && <ul>{s.body.map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>}
                {s.stat && <div className="big"><b>{s.stat}</b><span>{s.stat_label}</span></div>}
                <div className="foot"><span>{ev.name}</span><span>{deck.company}</span></div>
              </>
            )}
          </section>
          {team && s.notes && <div className="notes"><b>Speaker notes:</b> {s.notes}</div>}
        </div>
      ))}
      {deck.one_pager && (
        <section className="slide">
          <div className="k">One page</div>
          <h2>{deck.one_pager.headline}</h2>
          <ul>{(deck.one_pager.bullets || []).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
          <div className="big"><span style={{ fontSize: 18, color: "#131820" }}><b style={{ fontSize: 18 }}>Next step:</b> {deck.one_pager.ask}</span></div>
        </section>
      )}
      {team && deck.talk_track && (
        <div className="doc noprint" style={{ marginTop: 10 }}>
          <h1>Talk track (team only)</h1>
          <h2>Opening</h2><p>{deck.talk_track.opening}</p>
          <h2>Discovery questions</h2><ol>{(deck.talk_track.discovery || []).map((q: string, i: number) => <li key={i}>{q}</li>)}</ol>
          <h2>Pitch</h2><p>{deck.talk_track.pitch}</p>
          <h2>Objections</h2>{(deck.talk_track.objections || []).map((o: Any, i: number) => <p key={i}><b>{o.they}</b><br />{o.we}</p>)}
          <h2>Close</h2><p>{deck.talk_track.close}</p>
        </div>
      )}
    </div>
  );
}
