# Category exclusivity and renewal mechanics

Two clause families that are optional rather than default, and that go wrong in characteristic ways. **Not legal advice** - as everywhere in this skill, these are patterns for counsel to work from.

## Contents

1. Exclusivity is an add-on, never a default section
2. The cap-honouring rule
3. Three enforceability elements
4. Defining the category
5. Duration and the right-of-first-refusal alternative
6. Price premium bands
7. Renewal without a redraft

## 1. Exclusivity is an add-on, never a default section

The PyCon US 2020 sponsorship contract contains **no exclusivity clause anywhere**. At the community and volunteer pole, named per-category exclusivity is likewise the exception rather than the rule. In the tech conference, meetup and hackathon space specifically it is sold as a premium add-on to top tiers, not bundled into every sponsorship.

The practical consequence: draft this section only when the deal actually sold exclusivity. A template that ships an exclusivity clause by default quietly promises something no other sponsor was told about, and something the organizer may already have sold twice.

## 2. The cap-honouring rule

Where the prospectus published per-tier caps, the contract's exclusivity language may never be looser than what was printed. The published model is DevOpsDays Graz 2026: Gold capped at 3, Silver at 6, Bronze at 20, and single-exclusive surfaces capped at 1.

Two failure shapes follow from ignoring it:

- Promising "exclusive" at a tier that admits three sponsors. The word means something different to the sponsor's counsel than to the organizer who meant "one of only three".
- Inventing a tighter cap at drafting time to make an exclusivity claim work. Every other sponsor bought against the published document; a private cap in one contract contradicts it.

If the sponsor wants a cap the prospectus did not publish, that is a pricing and packaging decision that belongs upstream, not a drafting improvisation.

## 3. Three enforceability elements

Industry sources describe the same recurring failure: an exclusivity clause missing any one of these three is the one that produces the dispute.

1. **A specific category definition**, naming both what is included and what adjacent thing is excluded.
2. **A stated duration and channel scope** - how long, and across which surfaces (on-site, website, newsletter, stream, social).
3. **An explicit breach remedy** - what the sponsor gets if the organizer sells a competitor anyway, typically a defined refund percentage.

Draft all three or draft none. A clause granting exclusivity with no remedy tells a sponsor the promise is unenforceable the moment they read it carefully.

## 4. Defining the category

Definition, not the exclusivity right itself, is where disputes actually come from. Sponsorship-consulting guidance converges on one worked example: "beer" - a specific product - versus "alcoholic beverages", the much broader category the same clause could be read to include. At a technical event, the same trap sits in "observability" versus "developer tooling", or "CI" versus "the whole delivery pipeline".

Two carve-outs are named as the most common causes of a mid-event refund dispute, and both are worth writing in explicitly:

- **Venue-operated concessions.** The organizer usually cannot control what the venue sells or brands.
- **Pre-existing media partnerships.** A media partner or community partner signed before the exclusivity deal may already occupy the category.

Write the definition as a named list plus named exclusions plus these carve-outs, rather than a single category noun.

## 5. Duration and the right-of-first-refusal alternative

Best practice is to bound exclusivity strictly to the sponsorship term that funds it: exclusivity should not outlast the paid tier's own term by default.

When a sponsor pushes for multi-edition protection, the safer mechanic than a flat multi-year grant is a **right of first refusal on renewal** - the sponsor's competitive protection extends into the next edition only if they re-up, at terms offered within a defined window. Documented in academic sports-sponsorship literature, and it composes cleanly with the renewal mechanic below. It also keeps next edition's inventory sellable if the sponsor walks, which a flat multi-year exclusivity grant does not. Draft it as a time-boxed window to re-up, not as a right to match competing bids: a matching right chills competing bids, and `samber/dev-event-organizer-skills@event-sponsor-renewal` decides which hold to offer.

## 6. Price premium bands

Exclusivity carries a price. Industry sources, including Xarify, break down the most granular published breakdown at roughly:

- **15%** premium on the base tier price for low-contention categories
- **20-25%** for moderately contested categories
- **30-40%** for highly contested ones (its own examples: financial services, automotive, telecom)

Other sponsorship-consulting sources corroborate the direction - more contested category, higher premium - without publishing their own percentages.

**Cite these as documented industry guidance, never as a tech-conference-verified figure.** They come from sponsorship consulting rather than from any event's own contract, and the contention levels behind them are drawn from consumer-brand categories rather than developer-tool ones. The premium itself is a pricing decision that belongs to `samber/dev-event-organizer-skills@event-sponsor-pricing`; it appears here only so the contract's exclusivity section and the invoice do not disagree about what was bought.

## 7. Renewal without a redraft

The mechanic, and a good default: **replace the exhibit, not the agreement**. The PSF/PyCon US template shows this shape. The renewal path in that template is a separate branch of the same document - a renewal does not rewrite the agreement, it issues a new Exhibit A (benefits list, payment amount, any deal-specific clauses) and treats the sponsor's approval of that exhibit as written notice to continue under the original terms for another year.

This works well for a recurring event because it isolates everything that changes edition to edition - tier, price, perks, dates - inside one replaceable exhibit, leaving the negotiated legal terms untouched. It also means the exhibit has to be genuinely self-contained: a perk or a deadline written into the body of the agreement rather than the exhibit will be silently carried into a year where it no longer applies.

Two things to settle explicitly when drafting the renewal branch:

- **What happens on silence.** Automatic renewal on non-objection is convenient for the organizer and is the shape sponsors' procurement teams most often strike. Requiring affirmative approval of the new exhibit is slower and far easier to defend.
- **How exclusivity travels.** If exclusivity was sold, say whether it renews with the exhibit, lapses at term end, or converts into the right of first refusal described above.
