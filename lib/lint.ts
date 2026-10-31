// Email lint: port of sponsordesk-email/scripts/email_lint.py. A message that fails cannot be queued.
const DASHES: Record<string, string> = { "—": "em dash", "–": "en dash", "―": "horizontal bar", "‒": "figure dash" };
const BANNED = [
  "hope this email finds you", "hope you are doing well", "hope you're doing well", "i wanted to reach out",
  "reaching out to", "delve", "leverage", "synergy", "synergies", "game-changer", "game changer", "unlock",
  "elevate", "seamless", "i'd love to", "i would love to", "circling back", "touching base", "just checking in",
  "just following up", "excited to", "cutting-edge", "revolutioni", "in today's fast-paced", "look no further",
  "rest assured", "don't hesitate", "do not hesitate", "kindly do the needful", "win-win", "slots left",
  "only a few slots", "last chance", "act now",
];
const SIGNATURE_MARKERS = ["best regards", "regards,", "warm regards", "thanks,", "thank you,"];
const OPT_OUT = [
  /if (this|it) (is|isn't|is not) (not )?relevant[^.\n]*reply[^.\n]*(no|stop|remove)/,
  /reply ['"]?(no|stop|remove)['"]?[^.\n]*(will not|won't|wont) (follow up|email|write)/,
  /(will not|won't) (follow up|email you|write again)/,
];
const PLACEHOLDER = /\{\{[^}]*\}\}|\{[a-z_]+\}|\[(INSERT|TODO|TBD|NAME|COMPANY|X)[^\]]*\]|<(first_name|company|name)>|\bXX+\b|lorem ipsum/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const SIG_SPLIT = /\n\s*(best regards|regards|warm regards|thanks|thank you),?\s*\n/i;

export function fixDashes(t: string) {
  return t.replace(/\s*[—―]\s*/g, ", ").replace(/(\d)\s*–\s*(\d)/g, "$1-$2").replace(/\s*[–‒]\s*/g, ", ").replace(/\s--\s/g, ", ");
}

export function lint(subject: string, body: string, sequence = "other", step = 0, postal = ""): string[] {
  const p: string[] = [];
  subject = (subject || "").trim();
  const whole = subject + "\n" + body;
  for (const [ch, name] of Object.entries(DASHES)) if (whole.includes(ch)) p.push(`contains ${name}: rewrite with comma, colon or full stop`);
  if (/\s--\s/.test(whole)) p.push("contains ' -- ' used as a dash");
  const m = whole.match(PLACEHOLDER);
  if (m) p.push(`unfilled placeholder: '${m[0]}'`);
  const low = whole.toLowerCase();
  for (const b of BANNED) if (low.includes(b)) p.push(`banned phrase: '${b}'`);
  if (EMOJI.test(whole)) p.push("contains emoji");
  if (!subject) p.push("empty subject");
  if (subject.includes("!")) p.push("exclamation mark in subject");
  if (subject.split(/\s+/).length > 8) p.push("subject too long (max 8 words)");
  const tail = body.trim().toLowerCase().slice(-500);
  if (!SIGNATURE_MARKERS.some((s) => tail.includes(s))) p.push("missing signature block at the end");
  const idx = body.search(SIG_SPLIT);
  const main = idx >= 0 ? body.slice(0, idx) : body;
  const sig = body.slice(main.length);
  const words = main.split(/\s+/).filter(Boolean).length;
  if (sequence === "cold") {
    const limit = step === 0 ? 110 : 80;
    if (words > limit) p.push(`cold body too long: ${words} words (max ${limit})`);
    if ((main.match(/\?/g) || []).length > 1) p.push("more than one question in a cold email");
    if (step < 2 && !OPT_OUT.some((rx) => rx.test(main.toLowerCase()))) p.push("missing opt-out sentence, e.g. \"If this is not relevant, reply 'no' and I will not follow up.\"");
    if (!postal) p.push("no postal address configured (Settings)");
    else if (!sig.toLowerCase().includes(postal.toLowerCase())) p.push(`signature missing postal address ('${postal}')`);
    if (step === 0) {
      if (URL_RE.test(main)) p.push("link in first cold email body");
      if (/attach(ed|ment)|please find/.test(low)) p.push("attachment mentioned in first cold email");
    }
  }
  return p;
}
