---
name: sponsordesk-a4-pitch
description: SponsorDesk agent A4. Builds a short, company-specific sponsorship pitch deck (8-10 slides, sponsor's goals first, event details second) plus a one-pager and a spoken talk track with discovery questions and objection answers for the team to use in the meeting. Use whenever a sponsor meeting is scheduled or a sponsor asks for a deck or proposal.
---

# A4 Pitch: deck, one-pager and talk track

The deck is about **them**, not us. A sponsor's marketing head flips a deck asking "what do I get, what does it cost, can I defend this upward?". If the first three slides are about the fest's history, the deck has failed.

Depth references (vendored, MIT): `../third_party/coreyhaines-marketingskills/sales-enablement/` (deck frameworks, one-pager templates, demo scripts, objection library), `../third_party/samber-dev-event-organizer-skills/event-sponsor-prospectus/` (tier table, audience evidence, what never to print), `.../event-sponsor-value-proposition/` (proof points).

Reference decks to study for structure (search for current versions; do not copy design or text): published sponsorship prospectuses of large tech conferences and college fests (Techfest IIT Bombay, E-Summit past editions, MLH sponsor guide, DevOpsDays sponsor pages). Take the pattern, not the content.

## Inputs

Event profile (A0), company row and `reasons_json` (A1), contact row and its `evidence` (A2), the reply thread, and for meeting 2+ the A5 notes and action items.

## Step 1: one-paragraph thesis

Write: "For {{company}}, E-Summit is the fastest way to {{their goal}} because {{our audience fact}}; we recommend {{tier/package}} at {{price}}, which delivers {{2-3 measurable outcomes}}." Every noun in it must trace to a source. If you cannot write this paragraph, do not build the deck: ask the manager or run a discovery call first.

## Step 2: the deck (8-10 slides, 16:9)

| # | Slide | Content rule |
|---|---|---|
| 1 | Cover | "{{Company}} x E-Summit {{year}}" + one line of the thesis. Their logo (from their press kit) next to ours. |
| 2 | Your goal, in your words | 2-3 of their own signals with dates (hiring surge, launch, funding, campaign). Shows we did homework. |
| 3 | Who you will reach | Audience numbers that matter to THEIR goal only (e.g. final-year engineers for hiring; founders for VC). One chart max. |
| 4 | The idea | One named activation built for them (e.g. "Groww Investor Challenge" in the pitch competition). Visual mock if possible. |
| 5 | What you get | Recommended package as 5-7 deliverables, each with a number. Highlight the recommended tier. |
| 6 | How we measure it | What they will get in the post-event report: impressions, sign-ups via their code, applications, booth leads (opt-in). |
| 7 | Proof | 2-3 past sponsors with one result each, or testimonials (real, with permission). |
| 8 | Ways to partner | 2-3 options max (recommended in the middle), and they need not all be cash: e.g. Option A cash tier, Option B hybrid (smaller cash + product for 2,000 attendees), Option C opportunity partner (internships for winners + workshop). Price or in-kind value, tax note, payment or delivery terms. Pick options from `../sponsordesk-a0-package/references/collaboration-models.md`. |
| 9 | Timeline | Today -> MOU -> content calendar -> event -> report. Show the 3-4 months of pre-event visibility. |
| 10 | Next step + contacts | One ask ("Confirm the Gold package by {{date}} to lock the hackathon naming"). Liaison names and phone. |

Design rules: max 30 words per slide body; one idea per slide; numbers big, text small; event's brand colours with a neutral background; no stock photos of handshakes; no wall of past sponsor logos unless asked. Speaker notes on every slide.

**Never print**: unsourced audience numbers, guaranteed booth footfall, attendee contact lists without opt-in, judging or speaking-slot guarantees the policy forbids, fake scarcity.

Build it as a Slides artifact (or a .pptx via the pptx skill if the team needs PowerPoint, or Canva if connected). Export a PDF for email.

## Step 3: one-pager

A single page version (A4 / Letter): thesis, 3 audience numbers, the idea, recommended package and price, next step. This is the link that goes in A2's follow-up step 1 and the "send me something" reply.

## Step 3b: the champion's business case (most important document)

The person we talk to rarely pays. They must sell the spend to their boss and finance. Write a one-page, forwardable business case in their boss's language:
- **Objective** (theirs, in their words from the thread or call)
- **What we will do** (the activation, 3 lines)
- **Cost** (cash, plus in-kind if any, plus GST note)
- **Expected outcome and how it is measured** on their own systems (applications, sign-ups, code redemptions)
- **Unit economics** compared with what they already buy: cost per lead or sign-up vs their paid social cost, cost per hire vs a job board, CPM vs Instagram. Use their benchmarks if they shared them; otherwise show the formula and leave the comparison for them to fill. Never invent their numbers.
- **Proof**: one past partner result with source, and a reference POC who agreed to take a call
- **Timeline and decision date**

Send it as a PDF or doc with the one-pager after they reply "send". It is the attachment the champion pastes into their internal approval.

## Step 3c: proof pack (because sponsors distrust fest numbers)

Every audience number we print has a source and a counting method: gate or QR scans (not registrations), Instagram/LinkedIn insights screenshots with dates, last year's real sponsor report, photos with timestamps. Keep these in one folder linked from the one-pager. If a number has no proof, drop it.

## Step 4: talk track for the meeting (for our team, not the sponsor)

```
PRE-CALL BRIEF (read in 2 minutes)
Who: {{name}}, {{one_liner}}. Also joining: ...
Their goal (our hypothesis): ...
What they said so far: <quotes from thread>
Our goal for this call: <e.g. confirm need and budget range, agree on a proposal date>
Walk-away: below {{tier floor}} or exclusivity without Title = take back to manager

OPENING (60 sec)
"Thanks for the time. I'll keep this to 20 minutes: 5 minutes on what we know about {{company}}'s plans, then mostly questions, then a suggestion."

DISCOVERY QUESTIONS (ask 4-5, listen 70% of the call)
1. What does a successful campus or event partnership look like for you this year?
2. Is the goal more hiring, brand, product sign-ups, or community?
3. What did you sponsor last year, and what would you change?
4. Who else is involved in deciding, and what do they need to see?
5. What does your budget cycle look like? When are decisions made?
6. What number would you report upward after the event?

PITCH (3 min, only after discovery)
- Mirror their answer: "You said X matters most..."
- The idea (slide 4), the package (slide 5), the measurement (slide 6).
- Price once, clearly, then stop talking.

OBJECTIONS
| They say | We say |
| "Budget is tight" | "Understood. Which matters most to you: <A> or <B>? We can build a smaller package around that one." (remove deliverables, never discount the same package) |
| "We have no budget at all" | "Could {{company}} support in another way? For example {{need-list item they can supply: product, credits, internships, workshop}}. Your team gets {{their outcome}} and our attendees get something real." (switch to a no-money model, do not close as lost) |
| "Can we pay in product instead?" | "Yes, if it is something our attendees need. We count it at what it would cost us to buy, and in-kind can cover up to half of a tier." |
| "We don't see the value" | Treat as discovery: "What would you need to see to make this worth it?" |
| "We already sponsor another fest" | "What worked there? E-Summit differs on <audience/format>; we can avoid overlap and focus on <X>." |
| "Need exclusivity" | "Category exclusivity is available at <tier>. Let me confirm with our team." (exception inbox) |
| "Send me a proposal" | "Happy to. Two quick questions so it fits: <budget range>, <goal>." Agree a date to review it together. |
| "Not this year" | "When do you plan next year's campus budget? We will reach out then." |
| "Can you share attendee data?" | "We share opt-in leads only: everyone who visits your booth or registers for your challenge agrees to share their details with you." |

CLOSE
"Based on this, I will send <proposal/revised options> by <date>. Could we pencil 20 minutes on <date> to go through it with <their decision maker>?"
```

## Step 5: review

- Self-check against the rubric: is slide 2 about them? Every number sourced? One ask? Price clear? Under 10 slides?
- If the meeting is with a P1 company or a Title/Platinum prospect, send the deck + brief to `sponsordesk-council` with the rubric and the question "What will their marketing head object to, and which slide should be cut?". Show the verdict to the manager.
- Deliver to the manager at least 48h before the call: deck link, PDF, one-pager, brief. Attach the deck to the meeting invite description only after the manager approves.

## For meeting 2+

Update, do not rebuild: add a "What we heard" slide after the cover (their words from A5 notes), revise package and price to the discussed option, and change the close to the specific decision needed.
