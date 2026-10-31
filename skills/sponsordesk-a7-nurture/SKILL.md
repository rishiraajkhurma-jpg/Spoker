---
name: sponsordesk-a7-nurture
description: SponsorDesk agent A7. Keeps signed sponsors involved from MOU to event day and after - regular email updates to the sponsor POC (posts, reels, milestones, registrations), brand-approval requests, a deliverables tracker with proof, the post-event results report, and the renewal ask for next edition. Use for any communication with a signed sponsor before or after the event.
---

# A7 Nurture, deliver and renew

A sponsor who signs in October and hears nothing until the event in January feels like a cash machine. A7 makes the POC feel like part of the team, so that delivering is smooth and renewal is easy.

Depth references (vendored, MIT): `../third_party/samber-dev-event-organizer-skills/event-sponsor-fulfillment/` (fulfillment matrix, metric sourcing, post-event report), `.../event-sponsor-renewal/` (renewal timing, at-risk sponsors).

## Step 1: onboarding pack (within 2 days of `PAID`, or of `MOU_SIGNED` if payment terms allow)

Email (approve gate):
- Welcome + who their liaison is (name, phone).
- The deliverables tracker link (a shared Sheet: deliverable, date, status, proof link).
- What we need from them and by when: logo files (SVG/PNG), brand guidelines, booth details, product for sampling, speaker or judge names, approval contact.
- The content calendar for their mentions.

## Step 2: deliverables tracker (internal + shared view)

One row per deliverable from the MOU: `deliverable | qty | due | owner | status (planned/in approval/live/done) | proof_link | metric | metric_source`.
- Every social post or reel featuring them: send for approval 3 working days before it goes live (approval email template below), record approval, then record the live link and, after 7 days, the metrics (screenshot from Instagram/LinkedIn insights).
- Physical deliverables (stage logo, booth, merch): photos on event day, stored with the row.
- Anything slipping: tell the sponsor early with the fix. Never let them discover a miss.

### Two-way delivery for non-cash partners
For product, service and opportunity partners, the tracker also lists **what the company owes the audience**: products delivered (count, date), credits issued and redeemed, internships or interviews actually offered to named winners, mentorship hours held. Chase these like a payment: politely, early, with dates. The results report shows both directions, so the company sees what its contribution did for attendees ("142 startups activated your credits").

## Step 3: regular updates (the cadence)

Sponsors want low effort: one live link and few emails. The default is a **shared live tracker** (deliverables, dates, status, proof links, metrics) that the POC can check any time, plus:

| Phase | Email frequency | Content |
|---|---|---|
| Signing to T-2 weeks | Every 2 weeks (one short email) | What went live for them (links + numbers), what is next, anything we need |
| T-2 weeks to event | One logistics email, then calls/WhatsApp by the liaison | Passes, booth, arrival, contact on the day |
| Event day(s) | Human liaison only, no automated email | On-site support |
| After event | Day +2 thank-you with photos; results report within 7 days, raw data first | |

Content approvals are batched: one approval email covering all their upcoming posts for the next 2 weeks, not one email per post.

Batch all updates for the week and send the manager one approval message ("7 sponsor updates ready"). Updates go by email to the POC, cc the liaison.

### Update email (template, approve gate)
```
Subject: E-Summit update for {{company}}: {{headline, e.g. "12,400 registrations"}}

Hi {{first_name}},

A quick update from the E-Summit team.

Since last time
- {{milestone 1 with number}}
- {{their mention: post or reel link, reach so far}}

Coming up for {{company}}
- {{next deliverable}} on {{date}} (draft attached for approval)
- {{what we need from you}} by {{date}}

{{one human line: a photo from prep, a student reaction, a speaker announcement}}

{{signature}}
```
Rules: 120 words max, numbers sourced from our own analytics, at most one ask, no em or en dashes, no "Hope you are doing well".

### Approval request (approve gate, short)
```
Subject: Approval needed: {{post type}} on {{date}}

Hi {{first_name}},

Here is the {{reel/post}} featuring {{company}}, going live on {{date}}: {{preview link}}
Caption: "{{caption}}"

Could you approve or share changes by {{date, 3 working days}}? If we do not hear back by {{date+2}}, we will go ahead as per the MOU.

{{signature}}
```

## Step 4: results report (within 7 days of the event; raw data first)

Short PDF or Docs artifact, 4-6 pages:
1. Headline numbers for THEM (impressions on their posts, booth visitors (counted), opt-in leads, applications, code redemptions, sign-ups).
2. Every MOU deliverable with proof (photo/link) and status. Be honest about anything missed and what we did to compensate.
3. Best moments (3-5 photos with captions).
4. What we learned + what we would do differently for them.
5. Next edition: dates if known and a suggested package.

Metrics only from first-party sources (our analytics, scanner counts, their own code data). Label estimates as estimates.

## Step 5: renewal

- Ask within 3-4 weeks after the event, while results are fresh, and before their next budget cycle (Indian FY budgets often get set Feb-Mar).
- Offer: same tier with an improvement based on what worked, plus an early-renewal benefit that is not a price cut (first pick of booth location, named property, extra content).
- Large renewals: council review of the offer (`sponsordesk-council`).
- Contact changes: if the POC left the company, find the successor (A2 research) and also note the old POC's new company as a new prospect (A1).
- Stage `RENEWAL`; on yes, the deal re-enters A6 for next edition's MOU.

## Never

- Never promise extra deliverables in an update email without the manager's approval.
- Never post sponsor content without the approval step (or the MOU's deemed-approval window passing).
- Never send a sponsor someone else's data, report, or pricing.
