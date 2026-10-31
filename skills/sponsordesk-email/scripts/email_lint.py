#!/usr/bin/env python3
"""Lint a SponsorDesk email. pipeline_db.py calls this on every queue; a message that fails cannot be queued.

Usage: email_lint.py subject.txt body.txt [--sequence cold] [--step 0] [--postal "PIN or address text"] [--fix]
Prints PASS, or FAIL with one line per problem. --fix rewrites dashes in place (re-read the result).
Postal address: pass --postal or set SPONSORDESK_POSTAL (e.g. "400076"); required on cold emails.
Exit code 0 on PASS, 1 on FAIL.
"""
import argparse, os, re, sys

DASHES = {"—": "em dash", "–": "en dash", "―": "horizontal bar", "‒": "figure dash"}
BANNED = [
    "hope this email finds you", "hope you are doing well", "hope you're doing well", "i wanted to reach out",
    "reaching out to", "delve", "leverage", "synergy", "synergies", "game-changer", "game changer", "unlock",
    "elevate", "seamless", "i'd love to", "i would love to", "circling back", "touching base", "just checking in",
    "just following up", "excited to", "cutting-edge", "revolutioni", "in today's fast-paced", "look no further",
    "rest assured", "don't hesitate", "do not hesitate", "kindly do the needful", "win-win", "slots left",
    "only a few slots", "last chance", "act now",
]
SIGNATURE_MARKERS = ["best regards", "regards,", "warm regards", "thanks,", "thank you,"]
OPT_OUT = [
    r"if (this|it) (is|isn't|is not) (not )?relevant[^.\n]*reply[^.\n]*(no|stop|remove)",
    r"reply ['\"]?(no|stop|remove)['\"]?[^.\n]*(will not|won't|wont) (follow up|email|write)",
    r"(will not|won't) (follow up|email you|write again)",
]
PLACEHOLDER = re.compile(r"\{\{[^}]*\}\}|\{[a-z_]+\}|\[(INSERT|TODO|TBD|NAME|COMPANY|X)[^\]]*\]|<(first_name|company|name)>|\bXX+\b|lorem ipsum", re.I)
URL = re.compile(r"(https?://|www\.)\S+", re.I)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
SIG_SPLIT = re.compile(r"\n\s*(best regards|regards|warm regards|thanks|thank you),?\s*\n", re.I)


def fix_dashes(text):
    text = re.sub(r"\s*[—―]\s*", ", ", text)
    text = re.sub(r"(\d)\s*–\s*(\d)", r"\1-\2", text)
    text = re.sub(r"\s*[–‒]\s*", ", ", text)
    return re.sub(r"\s--\s", ", ", text)


def lint(subject, body, sequence="other", step=0, postal=None):
    p = []
    subject = subject.strip()
    whole = subject + "\n" + body
    for ch, name in DASHES.items():
        if ch in whole:
            p.append(f"contains {name} ({whole.count(ch)}x): rewrite with comma, colon or full stop")
    if re.search(r"\s--\s", whole):
        p.append("contains ' -- ' used as a dash")
    m = PLACEHOLDER.search(whole)
    if m:
        p.append(f"unfilled placeholder: '{m.group(0)}'")
    low = whole.lower()
    p += [f"banned phrase: '{b}'" for b in BANNED if b in low]
    if EMOJI.search(whole):
        p.append("contains emoji")
    if not subject:
        p.append("empty subject")
    if "!" in subject:
        p.append("exclamation mark in subject")
    if len(subject.split()) > 8:
        p.append(f"subject too long ({len(subject.split())} words, max 8)")
    if not any(s in body.strip().lower()[-500:] for s in SIGNATURE_MARKERS):
        p.append("missing signature block at the end")
    parts = SIG_SPLIT.split(body, maxsplit=1)
    main = parts[0]
    sig = body[len(main):]
    words = len(main.split())
    if sequence == "cold":
        limit = 110 if step == 0 else 80
        if words > limit:
            p.append(f"cold body too long: {words} words (max {limit})")
        if main.count("?") > 1:
            p.append("more than one question in a cold email (one ask only)")
        if step < 2 and not any(re.search(rx, main.lower()) for rx in OPT_OUT):
            p.append("missing opt-out sentence before the signature, e.g. \"If this is not relevant, reply 'no' and I will not follow up.\"")
        postal = postal or os.environ.get("SPONSORDESK_POSTAL")
        if not postal:
            p.append("no postal address configured (pass --postal or set SPONSORDESK_POSTAL)")
        elif postal.lower() not in sig.lower():
            p.append(f"signature missing postal address ('{postal}')")
        if step == 0:
            if URL.search(main):
                p.append("link in first cold email body (offer the one-pager on reply instead)")
            if re.search(r"attach(ed|ment)|please find", low):
                p.append("attachment mentioned in first cold email")
    return p, words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("subject"); ap.add_argument("body")
    ap.add_argument("--sequence", default="other"); ap.add_argument("--step", type=int, default=0)
    ap.add_argument("--postal"); ap.add_argument("--fix", action="store_true")
    a = ap.parse_args()
    s = open(a.subject, encoding="utf-8").read(); b = open(a.body, encoding="utf-8").read()
    if a.fix:
        s2, b2 = fix_dashes(s), fix_dashes(b)
        if (s2, b2) != (s, b):
            open(a.subject, "w", encoding="utf-8").write(s2); open(a.body, "w", encoding="utf-8").write(b2)
            s, b = s2, b2
            print("fixed dashes (re-read the sentences)")
    problems, words = lint(s, b, a.sequence, a.step, a.postal)
    if problems:
        print("FAIL"); [print(" -", x) for x in problems]; sys.exit(1)
    print(f"PASS ({words} words)")


if __name__ == "__main__":
    main()
