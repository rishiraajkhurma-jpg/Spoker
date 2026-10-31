---
name: sponsordesk-demo
description: Hackathon / demo mode for SponsorDesk (e.g. ContextCon "Services, Replaced", ~5 hours of build, judged on a demo video). Cuts the full pipeline to what can run live, defines the "unseen request to finished work" moment, gives an hour-by-hour build plan, the demo script, and answers to the hard judge questions. Use when preparing a demo, pitch or video of SponsorDesk, not for running a real sponsorship season.
---

# SponsorDesk demo mode

Judges score what runs on video, not the architecture diagram. Show three stages working end to end, one exception handled by a human, and say plainly what is stubbed.

## What "finished work" means in the demo

A sales cycle takes weeks, so the finished work for an unseen request is a **sponsor-ready campaign**:
1. a ranked list of about 30 companies, each with Crustdata signals and a reason for its score
2. verified decision makers, with alumni routes where they exist
3. a priced offer email and a one-page plan per company
4. the first batch waiting in the approval queue, with the no-double-send ledger visible
5. one simulated reply going all the way: classified, a below-floor counter goes to the exceptions inbox, the human approves a trade-value counter, the MOU draft is filled

## Build for real (in this order)

| # | Piece | Done when |
|---|---|---|
| 1 | Crustdata MCP connected, key in env var, `dry-run` checked | one company search and one people enrich return data |
| 2 | A0 as a short form: event, audience facts, 3 tiers, floor (from last year's closes) | JSON event profile saved |
| 3 | A1 on Crustdata for ~30 companies: dual-POV score, `reasons[]` with field, value, date | ranked board renders |
| 4 | A1 re-plan: re-check P1 signals, drop one company with a logged reason, promote the next | decision log line appears |
| 5 | A2: primary contact, verified email, alumni check (education filter) | contact rows with one-liners |
| 6 | A4 lite: priced offer email + one-pager per company, lint passing | `pipeline_db.py queue` says QUEUED |
| 7 | Email agent to **your own test inboxes only**: approve, claim, send, `sent` | ledger shows a second claim returns ALREADY |
| 8 | One reply (sent from a teammate's inbox): classify, `reply`, cold cancelled, counter below floor, exception, human approves, MOU template filled | MOU PDF/doc exists |

## Stub honestly (one slide each)

Calendar scheduling (show a template), Gemini notes (paste a transcript), GST/TDS (one rule on a slide), A7 nurture, the council, the full 25 collaboration models (show 5).

## Hour-by-hour (10:30 to 15:30)

- **10:30-10:50**: Crustdata access check (which endpoints the hackathon key allows), `pipeline_db.py init`, config, test inboxes. If enrichment or sending is broken at 12:30, switch to your fallback idea.
- **10:50-12:00**: pieces 2-4. Cache every Crustdata response to JSON so the demo can replay if the API or Wi-Fi fails.
- **12:00-13:00**: pieces 5-6. Run a second, different brief over lunch as the unseen-request test.
- **13:00-14:00**: pieces 7-8.
- **14:00-14:30**: minimal UI: brief form, ranked board with reasons, approval queue, exceptions inbox, decision log.
- **14:30-15:15**: **record the video** (do not leave this to the end), one clean take plus a backup.
- **15:15-15:30**: submit repo and video.

## The 3-minute demo script

1. (20 s) The job: fest sponsorship brokers charge 10-30% plus retainers; most of their hours are research, matching and writing.
2. (60 s) **Wow moment**: a judge or teammate types a brief never seen before ("Techfest robotics track, INR 15 lakh target"). The board fills: each row shows the Crustdata signal and why it scored that way.
3. (30 s) The agent drops a company by itself: "Dropped X: headcount -12% in 90 days and brand head left (Crustdata). Promoted Y via alumni route." This is the decision a mail merge cannot make.
4. (30 s) A priced offer email that quotes a real, sourced fact about the company; approval gate; ledger refuses a duplicate send.
5. (30 s) A reply arrives offering below floor: the exception lands in the inbox with the agent's counter (trade deliverables, not price); human approves; MOU draft appears.
6. (10 s) What is stubbed, said out loud.

## Hard judge questions

- **"Show me one decision a mail merge could not make."** The re-plan log line, on screen.
- **"Who pays you, and why would brands not ignore AI email?"** The organiser pays a success fee only on closed cash (no retainer). Emails are priced offers with sourced numbers, sent from the organiser's own address after human approval of the first batch, one thread per company. We do not claim reply rates yet; we are measuring them.
- **"What market beyond college fests?"** Fests are the wedge; the same job exists for conferences, newsletters, podcasts, creators and esports. The moat is response data: which brands say yes to which audiences. Bring one sourced market number or do not claim a size.
- **"What stops it emailing the wrong person?"** Code, not prompts: lint, suppression list, one thread per company, caps, approver check, reply cancels cold mail.

## Rules for the demo

- Never send real cold email under E-Summit, Techfest or IIT Bombay's name without written permission from those organisers. Use test inboxes or contacts who agreed.
- Never present simulated replies, payments or signatures as real.
- Claim exactly what runs. Do not say "replaces the corporate relations head" if three stages run.
