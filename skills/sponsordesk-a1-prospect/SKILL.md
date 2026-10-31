---
name: sponsordesk-a1-prospect
description: SponsorDesk agent A1. Finds every company that could sponsor the event and ranks them using a dual point-of-view fit score - the event marketing manager's view and the company marketing team's view - so only companies with a real intersection are approached. Uses Crustdata (company search, headcount growth, funding, job postings, people) plus web research. Use to build or refresh the sponsor target list.
---

# A1 Prospect: find and prioritize sponsors

Goal: about **50 sharp targets** in active play at any time (sized backward from the revenue goal, see below), after last year's sponsors from A0's handover, where each row says **why this company, why now, why us, and what to offer**, with evidence. A longer list is a reserve, not a send queue.

Depth references (vendored, MIT): `../third_party/coreyhaines-marketingskills/prospecting/` (signals, enrichment, compliance), `../third_party/samber-dev-event-organizer-skills/event-sponsor-outreach/references/pipeline-and-renewal.md` (Hot/Warm/Cold/Skip and backward pipeline math).

## Inputs

- Event profile from A0 (status `PACKAGED`). Refuse to run without it.
- Optional: manager's must-include / must-exclude list, past sponsors, competitor-fest sponsor lists.

## Step 1: size the list backward

`companies_needed = (revenue_goal - committed) / avg_deal_size / close_rate / reply_rate`
Use the team's own past rates if they exist; otherwise assume reply 10% and close 25% **and label them as assumptions**. Source 2-3x what the math says, because qualification culls hard.

## Step 2: build the long list (sources, in priority order)

1. **Past sponsors** of this event (lapsed ones especially) and of sibling fests (Techfest, Mood Indigo, other IIT E-Summits). Published sponsor pages are public proof of budget and intent.
2. **Organizer-network employers and alumni**: companies where IITB alumni hold marketing, HR or founder roles (Crustdata people search: `education contains "IIT Bombay"` + title filters).
3. **Signal-based discovery via Crustdata** (`crustdata://catalog` first, run `dry-run` before spending credits):
   - Funding raised in last 12 months (fresh marketing budget).
   - Headcount growth > 20% in 6 months (hiring push, employer branding need).
   - Open jobs for campus roles, interns, graduate programs, "campus ambassador", "brand manager", "community".
   - New CMO / Head of Brand / Head of Talent in the last 6 months (new leaders spend to make a mark).
   - Targets students or early-career users (fintech, edtech, D2C, food delivery, upskilling, laptops/phones).
   - Founder-ecosystem players: VCs, accelerators, cloud providers, banks with startup desks, SaaS with startup programs.
4. **Category mapping**: for each A0 segment, list category leaders and challengers in India.
5. Web search for "sponsored <peer fest> 2026", brand campus campaigns, press releases on youth marketing.

Record per company: name, domain, industry, HQ, headcount, funding stage and last round date, signals found with source and date.

## Step 3: dual-POV scoring

The deal only works where both sides win. Score each company twice (0-100 each), then compute the intersection.

### Our POV (the event marketing manager): "Is this sponsor worth chasing?"
| Factor | Weight | How to score |
|---|---|---|
| Ability to pay (budget signals: funding, revenue size, past sponsorships) | 25 | Crustdata funding/headcount; past fest sponsorships found |
| Brand fit and prestige (does their logo raise our event's standing?) | 20 | Category leader, known brand, no reputational risk |
| Likelihood to close (warm path, alumni, past relationship) | 20 | Warm intro or alum = high |
| Deal size potential vs our tiers | 15 | Map to likely tier |
| Value beyond cash (speakers, prizes, in-kind, internships for attendees) | 10 | |
| Effort to close (big corporate procurement = more effort) | 10 | Startups and mid-size score higher |

### Their POV (the company's marketing team): "Would I sponsor this?"
| Factor | Weight | How to score |
|---|---|---|
| Audience match: our attendees are their target customers or hires | 30 | Map their ICP or hiring profile to our audience profile |
| Live objective right now (hiring surge, launch, new market, rebrand, funding announcement) | 25 | Signal with date in last 6 months |
| Channel habit: they already spend on campus, events, fests, communities | 15 | Evidence of past campus or event spend |
| Measurable ROI available (leads, signups, applications, codes) | 15 | Can our inventory produce a number they report upward? |
| Budget timing (fiscal year: most Indian companies run Apr-Mar; budgets set Feb-Mar; Q4 Jan-Mar money may be "use it or lose it") | 10 | |
| Competitive pressure (a direct competitor sponsored us or a peer fest) | 5 | |

### Intersection
- `intersection = min(our_pov, their_pov)`; `fit_score = 0.5*our + 0.5*their`, but **priority is driven by intersection**, so a rich brand with no audience fit cannot reach P1.
- P1: intersection >= 70. P2: 50-69. P3: 35-49. Below 35: `DISQUALIFIED` with the reason.
- Hard disqualifiers (any one = skip): category conflicts with an existing Title/Platinum sponsor's exclusivity; brand-safety issue (tobacco, alcohol surrogate, gambling or betting, unless institute policy allows); company in distress (layoffs > 20% in 6 months, insolvency news); no reachable decision maker; institute rules forbid the category.

Every score line writes to `reasons_json`, e.g.
`{"claim":"Hiring surge","source":"crustdata","field":"headcount_growth_6m","value":"+34%","date":"2026-10-12"}`.

## Step 3b: non-cash partners are prospects too

Score companies that can fill a line of the A0 need list (food, prizes, credits, cabs, printing, internships, media coverage) even if they have no sponsorship budget. For them, "ability to pay" in our POV is replaced by "value of what they can supply against our need list" (cost-avoided INR). A company never gets disqualified for "no budget" alone: it gets a non-cash model instead.

## Step 4: model, tier suggestion and angle

For each P1/P2: the **recommended collaboration model(s)** from `../sponsordesk-a0-package/references/collaboration-models.md` (pick by the company's main goal using the table at the end of that file, and run the triple-win test), suggested tier or in-kind value, the A0 segment, the **one-line angle** (why them, why now) that A2 and A4 will reuse, e.g. "Raised Series B in Sept and is hiring 120 grads: E-Summit puts them in front of 8,000 final-year engineers before placement season."

## Step 4b: role map (who actually moves the money)

For each P1/P2 company, record `role_map_json`:
- **champion**: the person who will argue for us internally (brand manager, campus hiring lead)
- **budget owner**: their boss or the budget line (brand, campus HR, CSR, product marketing are separate budgets in the same company; a "no" from one is not a "no" from the others)
- **agency**: for FMCG, auto, telecom and large consumer brands, media budgets often sit with an agency (GroupM, Madison, Dentsu and others); note the agency if known
- **procurement / finance**: vendor onboarding, PO, payment terms
A2 targets the champion; A4 writes for the budget owner; A6 prepares for procurement.

## Step 4c: re-plan when the data changes (and log why)

Crustdata signals drive decisions, so new signals change the plan. Before each outreach batch, re-check P1 companies for: hiring freeze or headcount drop over 10%, layoffs news, the target person leaving, a competitor already signed in an exclusive category. When one fires: drop or pause the company, promote the next best, and write a log line a human can read, e.g. "Dropped Acme: headcount -12% in 90 days and brand head left (Crustdata, 2026-10-28). Promoted Beta: alumni route via R. Shah, intersection 74." This log is what proves the agent is deciding, not mail-merging.

## Step 5: quality check and hand-off

- Spot-check 10 random rows: does every claim have a source dated within 90 days?
- Diversify: no single industry over 30% of P1.
- Send the top 20 to the council (`sponsordesk-council`) with the rubric "Which scores are wrong and which 10 first?" when the manager wants it.
- Write companies to the DB with stage `QUALIFIED` (or `DISQUALIFIED` with reason). Show the manager a table: rank, company, tier, intersection, angle, top 2 reasons. Ask for removals before A2 starts.

## Output table columns

`rank | company | domain | segment | model (cash / in-kind / opportunity / hybrid ...) | tier_or_value | our_pov | their_pov | intersection | priority | angle | audience_benefit | top_reasons | warm_path`

Deliver as a Sheets artifact (or CSV) the manager can sort.
