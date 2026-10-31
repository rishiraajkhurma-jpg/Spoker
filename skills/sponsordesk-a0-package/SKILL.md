---
name: sponsordesk-a0-package
description: SponsorDesk agent A0. Defines and prices what an event sells before any outreach - builds the event profile (audience, reach, flagship properties), lists sellable inventory, designs four tiers plus in-kind, and gets the manager to lock a floor price. Use when starting sponsorship for a new event or edition, or when tiers or prices need revising.
---

# A0 Package: define and price what we sell

A broker who cannot say exactly what is for sale, at what price, and where the floor is will either undersell or stall. A0 produces the **event profile** (`../sponsordesk-orchestrator/references/event-profile-template.md`) that every other agent reads. Nothing downstream runs until `floor_inr` is locked by the manager.

Depth references (vendored, MIT): `../third_party/samber-dev-event-organizer-skills/event-sponsor-pricing/`, `.../event-sponsor-value-proposition/`, `.../event-sponsor-prospectus/`.

## Step 1: interview (one question at a time)

1. Event basics: name, edition, dates, venue, website.
2. Audience numbers with their source: last edition footfall, registrations, split students/professionals, colleges, founders and investors attending. If a number has no source, record `UNKNOWN`. Never estimate an audience figure into a sponsor-facing document.
3. Reach: follower counts per platform (ask the manager to screenshot or paste), last edition impressions, email list size.
4. Past sponsors (year, tier, amount if shareable). These are both proof and the warmest prospects.
5. Flagship properties a brand can attach its name to (pitch competition, expo, hackathon, speaker series, internship fair, workshops).
6. Revenue goal, and money already committed (renewals).
7. Policies: what we never sell (speaking slots? judging? attendee data?), exclusivity rules, GST status, which legal entity invoices, payment terms.
8. Sender details for the signature.

## Step 2: inventory

List every deliverable as an atomic item with a unit and a maximum count: booth, stage logo, title naming, prize naming, workshop slot, social post, reel, newsletter mention, merch logo, sampling, hiring corner, resume book (opt-in only). For each, write what proof of delivery will exist (photo, post link, screenshot of analytics) because A7 must later prove it.

## Step 3: tiers (Title / Platinum / Gold / Silver + In-kind)

Build a ladder, not a menu:
- **Anchor high**: Title is the price anchor and usually sells 0 or 1 time.
- **Each tier step up adds one clearly visible thing**, not just "more posts".
- **Scarcity is real**: tier counts must match physical limits (stage logo slots, booth count).
- Price each tier from three inputs and show the reasoning in `reasons[]`:
  1. Cost-plus: what the deliverables cost us + margin.
  2. Value: audience size x relevance x a CPM/CPL comparison (e.g. what a brand pays per 1,000 student impressions on Instagram, or per hiring lead on a job board). Cite the comparison source.
  3. Market: what comparable fests charged (past sponsor amounts, peer fest decks the team has).
- Price in round INR (e.g. 15,00,000 not 14,73,000). State "plus 18% GST" if applicable.
- In-kind tier: products/services valued at retail with a minimum value and a rule that in-kind never exceeds 50% of a deal unless the manager approves.

## Step 3b: collaboration menu (not just cash)

Read `references/collaboration-models.md`. With the manager, decide which models this event offers beyond cash tiers: product, services, opportunity, venue/logistics, media, knowledge, platform, offer/discount, community, revenue share, dealer co-op, performance-linked, CSR, annual partnership. For each one offered, write in the event profile:
- the **need list**: what the organizers actually need in kind (food for N people, prizes worth X, cloud credits for N startups, cab credits, printing, internships for winners), with the cost-avoided value of each from real quotes or last year's bills
- the **audience benefit** it creates
- how it maps onto tiers (cost-avoided value counts toward tier credit; in-kind may cover up to 50% of a tier without manager approval)

The need list is gold for A1 and A5: a company with no budget can still fill a line on it.

## Step 4: floor price (exception boundary)

Price against the market, not against our costs (a logo on a stage costs almost nothing, so cost-plus floors are meaningless for cash tiers).
- **Inputs**: last edition's actual closed amounts per tier (not list prices), peer fests' rate cards (Techfest, other IIT E-Summits, Mood Indigo), and what this year's audience proof can justify.
- `floor_inr` (smallest cash deal without the manager) and per-tier floors default to about 75-85% of last year's median closed amount for that tier. Show the data behind it in `reasons[]`.
- Use cost only for activations and in-kind items, where real money is spent (booth build, food, prizes).
- A5 negotiates between list and floor by **removing deliverables, never discounting the same package**. Below any floor = exceptions inbox.
- The manager types the floor and tier prices back to confirm. Record `locked_by`, `locked_at`, then set the event stage to `PACKAGED`.

## Step 4b: calendar, signatories and paperwork (ask once, store in the event profile)

- **Selling season**: most corporate campus budgets are planned in Feb-Apr (Indian FY starts April) and spent through the year; outreach for a Jan/Feb fest works best from June to October. If today is late in that window, tell the manager plainly and lean on renewals, in-kind and Q4 "use it or lose it" budgets.
- **Who signs**: students usually cannot sign an MOU or issue an invoice. Record the legal entity (institute, registered society or trust), the signatory (faculty advisor, Dean, registrar) and their **usual turnaround in working days**. A6 uses this to give sponsors honest dates.
- **Vendor kit** (prepare before the first meeting, A6 sends it on request): PAN, GST registration certificate, cancelled cheque or bank letter on letterhead, MSME certificate if any, entity registration document, authorised signatory letter, standard vendor registration form answers.
- **Tax notes for the deal math**: GST mode (`forward` or `reverse`, see A6) and TDS that sponsors usually deduct (sponsorship is generally treated as a contract payment, often 2% for a company payee; confirm with the accounts office). A5 and A6 show net cash after TDS.

## Step 4c: import last year's relationships first

Most fest sponsorship money comes back from people who sponsored before. Before A1 searches for anyone new, import the handover from last year's team into the DB:
- every past sponsor, tier, amount, POC (name, email, phone), liaison, what was delivered, what was promised and NOT delivered, complaints, and how the relationship ended
- every company that said "not this year" and when they asked to be contacted again

These become the first pipeline (stage `RENEWAL` or `QUALIFIED` with `warm_path = past sponsor`). A7's renewal rules apply. A gap in delivery last year must be acknowledged in the first message, not hidden.

## Step 5: value statements per sponsor segment

Write one 2-line value statement per segment, each backed by a profile fact:
- **Hiring / employer brand** (tech, consulting, finance): reach to N final-year students from X colleges.
- **Brand awareness / consumer** (D2C, food, fintech apps): N students, campus sampling, reels.
- **Founder ecosystem** (VCs, SaaS for startups, cloud credits, banks with startup programs): N founders and startups at the expo.
- **Product feedback / developer** (dev tools, AI platforms): hackathon participants using the product.
- **CSR / institutional** (PSUs, foundations): social impact track, policy sessions.

A1 uses these segments to match companies; A4 uses them in the deck.

## Output

1. `event_profile.yaml` filled (stored in `events.profile_json`), including the in-kind need list and the collaboration models offered.
2. A one-page rate card (Markdown or a Sheets/Docs artifact) the manager can share.
3. A 1-paragraph "what we sell" summary for the A4 deck.

Run the council (`sponsordesk-council`) on the tier ladder if the manager wants a second opinion before locking.
