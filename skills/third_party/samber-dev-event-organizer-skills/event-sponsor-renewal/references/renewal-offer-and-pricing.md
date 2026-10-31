# Renewal offer, timing and price changes

Read this when preparing the renewal call, the proposed package, or the formal renewal ask.

## Contents

- The two asks
- Hold dates
- Early-commitment incentives without a discount
- Multi-edition agreements
- Price increases for returning sponsors
- Tier read
- Ask templates

## The two asks

| Ask | When | Carries | Basis |
| --- | ---- | ------- | ----- |
| Soft ask | at the debrief call, days after the stage-2 report | one proposed package + a hold date | Sponsorship Collective: raise renewal "in a matter of days", at the fulfillment-report meeting |
| Formal ask | before the sponsor's budget locks for the year the next edition falls in | written proposal, rate-card price, agreement draft | DevOpsDays organizing guide: sponsors lock budgets the financial year prior, hence prospectus at T-8 months |

- Ask the champion on the debrief call when their budget locks. That date, not your event date, sets the formal-ask deadline.
- Budget locks before your report date: make the soft ask on site or before the event, with last edition's report, or the on-site headline numbers for a first-time sponsor, as evidence.
- Next date or venue not fixed when the budget locks: hold a package and a price, with date and venue "confirmed by [date]".
- MLH's organizer guide sets the same timing: close the next edition right after this one. Offer the non-price incentives below in place of its "special deal".

## Hold dates

- **Renewal hold** (a right of first negotiation): "We hold [package or capped surface] for you until [hold date]." After it, the surface opens to other sponsors.
- Set the hold date 30-60 days after the stage-2 report (a judged window). Budget locks inside that window: set the hold date a few business days before the lock. Budget lock unknown: ask on the call; still unknown, the hold date stands. Budget locks later than the window: ask for written intent by the hold date and convert at budget lock; the capped surface stays held only for a sponsor who gave intent.
- **Matching-rights right of first refusal** - avoid. One organizer-side law firm advises removing it because a competitor will not bid on a surface someone else can match. Sample conference clauses that grant one give the sponsor up to 90 days after the event to elect renewal.
- Clause drafting for either belongs to `samber/dev-event-organizer-skills@event-sponsor-agreement`. This skill decides what to offer.

## Early-commitment incentives without a discount

`event-sponsor-pricing` deletes the returning-sponsor discount: a loyalty rate cut compounds into a permanently discounted anchor sponsor. Sponsorship consultancies recommend early-renewal discounts; offer these instead, most efficient first:

1. **First pick of capped surfaces** - community-run: booth location, workshop room, prize track; company-run adds a sponsored talk slot, and category exclusivity at its card premium within the published cap. Only a returning sponsor can be offered it before the prospectus is public, and it costs nothing. Two returning sponsors wanting the same surface: higher tier first, then whoever confirmed first.
2. **Published price-change date** - when an increase exists, pricing publishes the date it takes effect; anyone signing earlier pays the current price. Returning sponsors hear the date first and privately, which is the advantage, not a different price. Set the date at least 30 days (a judged floor) after the prospectus is public, so new sponsors can sign at the current price too.
3. **The rate card's own early-bird** - only where the card has one, open to every sponsor on the same terms.

A make-good for last edition's miss is compensation, not an incentive. Keep it in kind; a credit toward next edition goes through pricing's deviation log.

## Multi-edition agreements

- Public examples fix year one and escalate later years by CPI; template advice suggests a 3-5% annual escalator. Neither is a measured norm.
- Volunteer-run event: two editions at most, with an annual opt-out tied to defined deliverables (a judged default). Organizing teams turn over; a commitment longer than the team's tenure binds people who never agreed to it.
- Company or foundation-run event: multi-year terms are reasonable, with a yearly review point and a cancellation refund clause drafted by counsel.

## Price increases for returning sponsors

The PSF's PyCon US is the public precedent: after loss-making years it raised sponsorship package prices to match inflation and published the reasons (inflation, venue contracts, its own finances).

1. Tie the increase to a documented change: venue cost, cost per attendee, audience growth, new inventory, inflation. Pricing derives the sponsor-price increase from the cost line's share of the budget, not from the venue's own percentage; this skill states the reason in one line ("the venue raised its rate; sponsorship covers [share] of that cost"). A rate justified on tenure alone invites pushback.
2. Tell returning sponsors privately, at the debrief, before the public prospectus. Practitioner advice asks for at least 90 days before the renewal decision; when the budget lock is closer than that, the published price-change date covers the gap. Price-change date not set yet: quote the indicative new price and promise that agreements signed before the date pricing publishes by [date] keep the current price.
3. Add the value before the price: the fix from the report's what-went-wrong section lands in the same message.
4. The new list price itself is set by `samber/dev-event-organizer-skills@event-sponsor-pricing`; this skill only communicates it.

## Tier read

Read the sponsor's results against the tier they bought:

| Read | Offer | Why |
| ---- | ----- | --- |
| Objective met, surfaces fully used, asks for more | upgrade, or add the add-on that produced their result | a sponsor whose spend never grows treats you as a fixed cost (Sponsorship Collective) |
| Objective met at this level | same package | don't oversell a working renewal |
| Right audience, wrong package (booth quiet, session full) | swap: workshop or prize track instead of booth, same or lower price | losing a tier beats losing the sponsor |
| Budget cut, still fits | downgrade, framed as right-sizing, path back up stated | keeps the logo; revenue retention dips, logo retention holds |
| Audience mismatch | release honestly, no offer | a mismatched renewal churns next edition with a worse story |
| In-kind contributor | same contribution, or a named larger one | no price line; value their contribution at what it displaced |

## Ask templates

Proposal email (when the champion declines a call or the tier gets no call):

```
Subject: [Event] [next edition] - a proposal, and one question

Hi [name], thank you again for [edition]; the report is attached. Based on [their result],
we'd suggest [package] for [next edition] ([date or "date confirmed by X"]), and we hold
it for you until [hold date]. One question so we get it right: what does your team
report on internally, and when does your budget for [year] lock?
```

Soft ask, end of the debrief call (spoken):

```
Based on what you told us your team reports on, the [package] gets you [their result]
again, plus [the fix]. We'd like to hold it for you until [hold date]. Who besides you
signs off, and when does your budget for [year] lock?
```

Formal ask email:

```
Subject: [Event] [next edition] - your [package], held until [hold date]

Hi [name],

Following our call on [date]: here is the [package] we discussed for [next edition]
([date / "date confirmed by X"], [city]).

What changes for you: [the fix from the report], [the new surface or room].
Price: [rate-card price]. [If an increase applies: "The current price applies to
agreements signed before [published price-change date], because [documented reason]."]

We hold [the capped surface] for you until [hold date]. After that it opens to other sponsors.

The report from [edition] is attached again for [budget owner's name], in case
it helps your internal review.

[Name]
```

Release message (in writing):

```
Hi [name], thank you for backing [edition]. Looking at what you told us you need -
[their objective] - our audience is not the right fit for next year, and I'd rather
say so than sell you a package that won't deliver. If [what would change: a new
track, a different audience mix] happens, I'll come back to you first.
```

Never send the formal ask to a sponsor in the rescue path (SKILL.md workflow step 2) before its reason is known and answered.
