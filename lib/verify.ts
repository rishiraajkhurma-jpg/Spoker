// Source verification: an AI-written URL is never proof on its own.
// A source counts only if the page answers, or the URL came back from a real search/tool result.
export type CheckedSource = { url: string; title?: string; supports?: string; verified: boolean; how: "fetched" | "search_result" | "unreachable"; status?: number };

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1\]?$)/i;

export function cleanUrl(u: string) {
  try {
    const x = new URL(String(u || "").trim());
    if (!/^https?:$/.test(x.protocol) || PRIVATE.test(x.hostname)) return "";
    x.hash = "";
    return x.toString().replace(/\/$/, "");
  } catch { return ""; }
}

async function probe(url: string, ms: number): Promise<number> {
  const h = { "user-agent": "Mozilla/5.0 (compatible; SponsorDesk source check)", accept: "text/html,*/*" };
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", headers: h, signal: AbortSignal.timeout(ms) });
    if (r.status === 405 || r.status === 501) r = await fetch(url, { method: "GET", redirect: "follow", headers: h, signal: AbortSignal.timeout(ms) });
    return r.status;
  } catch { return 0; }
}

/** Check up to `max` sources in parallel. `seen` = URLs that appeared in real search or tool output this run. */
export async function verifySources(list: { url: string; title?: string; supports?: string }[], seen: string[] = [], max = 15, ms = 6000): Promise<CheckedSource[]> {
  const seenSet = new Set(seen.map(cleanUrl).filter(Boolean));
  const uniq: { url: string; title?: string; supports?: string }[] = [];
  for (const s of list || []) {
    const url = cleanUrl(s?.url);
    if (url && !uniq.some((x) => x.url === url)) uniq.push({ ...s, url });
    if (uniq.length >= max) break;
  }
  return Promise.all(uniq.map(async (s) => {
    const status = await probe(s.url, ms);
    if (status >= 200 && status < 400) return { ...s, verified: true, how: "fetched" as const, status };
    // Sites like LinkedIn or Cloudflare-protected pages refuse bots; accept them only if a real search returned the URL.
    if (seenSet.has(s.url)) return { ...s, verified: true, how: "search_result" as const, status };
    return { ...s, verified: false, how: "unreachable" as const, status };
  }));
}
