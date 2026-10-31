# SponsorDesk skill pack

An end-to-end sponsorship broker built from Claude skills: package, prospect, target, pitch, negotiate, close, renew. Humans only for approvals and exceptions. Every decision cites its reasons.

## What is inside

| Folder | Agent | Job |
|---|---|---|
| `sponsordesk-orchestrator/` | Master | Routes work, owns pipeline DB (`scripts/pipeline_db.py`), approval gates, daily cycle |
| `sponsordesk-email/` | Email agent | Every email: house style, no em/en dashes, signature, lint (`scripts/email_lint.py`), no-double-send |
| `sponsordesk-a0-package/` | A0 | Event profile, inventory, 4 tiers, locked floor price, in-kind need list, collaboration models catalogue (cash, product, service, opportunity, hybrid) |
| `sponsordesk-a1-prospect/` | A1 | Find companies, dual-POV fit score (our view x their marketing team's view) |
| `sponsordesk-a2-outreach/` | A2 | Decision makers (name, designation, verified email, business phone, evidence, relevance score), first touch, follow-ups, reply detection |
| `sponsordesk-a3-scheduler/` | A3 | Meeting scheduling by email + Calendar/Meet invite, 11 templates |
| `sponsordesk-a4-pitch/` | A4 | Company-specific 8-10 slide deck, one-pager, talk track with objections |
| `sponsordesk-a5-meeting-followup/` | A5 | Gemini meeting notes, recap, negotiation inside the floor, post-meeting cadence |
| `sponsordesk-a6-mou-close/` | A6 | 2-3 page MOU, redlines to manager, invoice, payment chase |
| `sponsordesk-a7-nurture/` | A7 | Updates to sponsor POC until the event, deliverables proof, results report, renewal |
| `sponsordesk-demo/` | Demo mode | 5-hour hackathon cut, demo script, judge Q&A |
| `sponsordesk-council/` | Reviewer | karpathy/llm-council as a multi-model review panel for high-stakes calls |
| `third_party/` | Imported | MIT skills from samber/dev-event-organizer-skills and coreyhaines31/marketingskills |

## Pipeline

```
A0 PACKAGE -> A1 PROSPECT -> A2 CONTACT + OUTREACH -> (reply) -> manager -> A3 SCHEDULE
   -> A4 DECK -> meeting -> A5 NOTES + NEGOTIATE --(another meeting)--> A3
   -> A6 MOU -> INVOICE -> PAID -> A7 UPDATES -> EVENT -> REPORT -> RENEWAL
Email agent sits under every arrow. Council reviews P1 list, decks, MOUs, below-floor offers, renewals.
```

## Install

**Claude (claude.ai / desktop):** zip each `sponsordesk-*` folder separately and upload it under Settings > Capabilities > Skills (or ask Claude to "save these as skills"). Upload `third_party/*` skills too if you want the deeper references available.

**Windows (one command, does everything below):** `powershell -ExecutionPolicy Bypass -File .\install_sponsordesk.ps1`

**Claude Code:**
```bash
cp -r sponsordesk-* third_party/*/* ~/.claude/skills/        # or .claude/skills/ in a project
```

**Claude Agent SDK:** point the agent's skills directory at this folder; use `sponsordesk-orchestrator` as the entry skill.

Then:
```bash
python3 sponsordesk-orchestrator/scripts/pipeline_db.py init
bash sponsordesk-council/scripts/install_llm_council.sh     # optional, needs an OpenRouter key
```

## Connect these

- **Crustdata MCP**: `https://install.crustdata.com/mcp` (sign in, or `Authorization: Bearer <key>` for programmatic use)
- **Gmail** of the manager (read, draft, send, labels). Without send permission the system runs in draft mode.
- **Google Calendar** (invites with Meet + Gemini notes) and **Google Drive** (notes docs)
- Optional: Canva or Slides for decks, a Docs/Sheets surface for MOU and trackers, OpenRouter for the council

## First run

Say to Claude: "Use sponsordesk-orchestrator. New event: E-Summit 2027." It interviews you (A0), locks the floor, then builds the target list.

Daily: "Run the SponsorDesk daily cycle." It sweeps replies first, sends due follow-ups, prepares approvals, and reports.

## What the code enforces

`pipeline_db.py` is the only path to sending: lint must pass (no dashes, placeholders, missing opt-out or postal address), suppressed people are never contacted, one live cold thread per company and max 3 cold emails, only configured human names can approve (auto only for follow-ups with no reply), daily caps and spacing, a reply cancels cold mail for the whole company, out-of-office pauses instead of killing the sequence, and `reconcile` recovers from crashes.

First-time setup after install: `python sponsordesk-orchestrator/scripts/pipeline_db.py config set postal 400076` and `config set approvers "Your Name"`.

## Honest limits

- Gemini meeting notes need a Google Workspace plan with Gemini, English-language meetings, and reach external guests only if the host shares with "all invited guests". A5 falls back to manual notes.
- MOU template is not legal advice: get the institute's legal/finance office to approve the master once.
- llm-council is an unsupported hobby project (no license file), installed from GitHub, not bundled.

## Credits

- samber/dev-event-organizer-skills (MIT, Samuel Berthe): sponsor outreach, pricing, prospectus, value proposition, agreement, fulfillment, renewal
- coreyhaines31/marketingskills (MIT, Corey Haines): cold-email, prospecting, emails, sales-enablement
- karpathy/llm-council: multi-model council (installed separately)
