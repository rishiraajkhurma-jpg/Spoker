"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Minimal, safe Markdown to HTML for MOUs (headings, lists, tables, bold, paragraphs). Escapes HTML first.
function md(src: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
  const lines = src.replace(/\r/g, "").split("\n");
  let html = "", i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      html += "<table>" + body.map((r, k) => "<tr>" + cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("") + "</tr>").join("") + "</table>";
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      html += ordered ? "<ol>" : "<ul>";
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`;
      html += ordered ? "</ol>" : "</ul>";
      continue;
    }
    if (l.trim()) html += `<p>${inline(l)}</p>`;
    i++;
  }
  return html;
}

export default function MouPage() {
  const { id } = useParams() as { id: string };
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/public?kind=mou&id=${id}`, { cache: "no-store" }).then((r) => r.json()).then((j) => (j.error ? setErr("This document is not available.") : setD(j))).catch(() => setErr("This document is not available."));
  }, [id]);
  return (
    <div style={{ padding: "32px 16px 60px", minHeight: "100vh" }}>
      <div className="row noprint" style={{ maxWidth: 820, margin: "0 auto 14px", justifyContent: "space-between" }}>
        <span className="muted">{d ? `${d.company}, ${d.tier} partnership` : ""}</span>
        <button className="btn ghost" onClick={() => window.print()}>Save as PDF</button>
      </div>
      {err ? <div className="doc">{err}</div> : !d ? <div className="doc">Loading...</div> : <article className="doc" dangerouslySetInnerHTML={{ __html: md(d.mou || "") }} />}
    </div>
  );
}
