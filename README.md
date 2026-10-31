# SponsorDesk

Sponsorship brokerage agents for college fests and events: find sponsors with live budget signals, write priced offers, follow up without ever double-sending, classify replies, negotiate inside the floor, draft the MOU. Humans only for exceptions. Every decision cites its reasons.

Runs on Gemini (`GEMINI_API_KEY`, function calling with a built-in MCP client for Crustdata) or Claude (`ANTHROPIC_API_KEY`, Messages API MCP connector), with Crustdata for B2B company and people data.

## What it does

| Stage | Agent | In this app |
|---|---|---|
| Package | A0 | Brief tab: audience facts with sources, tiers, floor price, in-kind needs, signature |
| Prospect | A1 | Board > Find sponsors: Claude searches Crustdata for funding, headcount growth, hiring, new leaders |
| Score | A1 | Dual point of view: our view x the company marketing team's view; priority = the lower of the two; every score shows its signals |
| Target | A2 | Decision maker via Crustdata people search, business email, alumni route, one-liner, role map (champion, budget owner, agency, procurement) |
| Pitch | A2 | First email is a priced offer (activation, price range, metric, reply "send"), never a meeting request |
| Follow up | A2 | Max 3 emails, one thread per company, auto follow-ups only while nobody replied |
| Replies | A2 | Gmail sweep, isolated classifier (sponsor email is untrusted input), cold mail stops for the whole company |
| Negotiate | A5 | Below-floor offers become exceptions with a trade-value counter for a human to approve |
| Close | A6 | MOU draft from the deal sheet |

## Safety rules enforced in code (`lib/ledger.ts`)

- Every email passes the linter (no em/en dashes, no placeholders, signature, postal address, opt-out on cold mail) before it can be queued.
- Only configured approver names can approve; the agent can only auto-approve follow-ups to companies that never replied.
- A unique key per email plus an atomic claim makes a second send impossible; `reconcile` recovers from crashes using a body hash.
- Daily caps and spacing; suppression list for opt-outs and bounces; erase-on-request (DPDP).
- Out-of-office pauses a sequence instead of killing it; a reply on a live deal never resets its stage.
- Cold emails are held until the organisers' written permission is recorded in Settings.

Tests: `scripts/test-ledger.ts` (31 checks) and `scripts/test-flows.ts` (end to end with Claude mocked).

## Deploy on Vercel

1. Import this repo in Vercel.
2. Storage > Create Database > Neon (free). This adds `DATABASE_URL`.
3. Environment variables: `APP_PASSWORD`, `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`), `CRUSTDATA_API_KEY`, `CRON_SECRET`, optional `SD_MODEL`, and for Gmail `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (see `.env.example`).
4. Redeploy. Open the app, log in, fill the Brief, set approvers in Settings.

### Gmail (optional, otherwise draft mode)
Google Cloud Console > APIs & Services: enable the Gmail API, OAuth consent screen (External, Testing, add your Gmail as a test user), Credentials > OAuth client ID > Web application, authorised redirect URI `https://<your-app>.vercel.app/api/google/callback`. Put the client id and secret in Vercel, redeploy, then Settings > Connect Gmail.

The daily cycle runs on weekdays at 10:15 IST (Vercel cron) and from the "Run daily cycle" button.

## Skill pack

`skills/` holds the full SponsorDesk skill pack (orchestrator, email agent, A0 to A7, council reviewer, demo mode) for use directly in Claude, plus vendored MIT skills from samber/dev-event-organizer-skills and coreyhaines31/marketingskills.

## Honest limits

- Contacts and signals are only as good as Crustdata's coverage; the app never invents an email, and unverified emails raise an exception.
- LinkedIn is not automated (LinkedIn's User Agreement forbids it).
- The MOU is a draft for the institute's office, not legal advice. GST and TDS treatment must be confirmed by the accounts office.
