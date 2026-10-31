# Tier table format and perks catalog

## Table structure

DevOpsDays Graz 2026 "Packages Overview" page provides a model. Rows are benefit line items, columns are tiers.

Five tiers, the last three priced identically but differing by which single exclusive branding surface each buys, not by a logo-size ladder:

- Gold: €4,000.
- Silver: €2,500.
- Bronze: €1,500.
- Lanyard: €1,500.
- Swag Bag: €1,500.

Line items in printed order:

1. The price row ("Investment in your Brand Visibility") - **placed first, never buried**
2. Max. available sponsorships - the scarcity row (Gold 3, Silver 6, Bronze 20, Lanyard 1, Swag Bag 1)
3. Guest tickets included (count)
4. Booth staff (count)
5. Discount on additional tickets (flat 20% across tiers)
6. Booth (large / small / none)
7. Banner on the main stage (top tier only)
8. On-stage pitch talk (top tier only, capped at 3 minutes)
9. Logo on rotating break slide (top tier only)
10. Logo in newsletter / social announcement / event page / swag-bag insert (all tiers)
11. Tier-specific special perk ("Logo on lanyard" / "Logo on swag bag" - the row that explains why the exclusive tiers exist)

Cells use a plain mark for included, blank for not - no scoring, no partial-inclusion notation. Treat this as the default cell format. Reserve numbers for line items that are genuinely quantities (ticket counts, discount percentages).

The table closes, on the same page, with an explicit custom-tier escape hatch ("We are open to other exclusive tiers") and the contact-email call to action. Keep both beside the table, never a page later.

## Perk naming

A named perk feels more real than a described one: real add-ons read "Photo Booth Sponsor", "Party Sponsor", "Merch Sponsor" - never "branding add-on 1/2/3". Two elements of general offer naming carry over: name the perk, and use a container word that signals format - "Track", "Fair", "Lounge", "Corner" for prize tracks, recruiting fairs, sponsor lounges, demo corners. Avatar-in-the-name and time-frame elements belong to consumer offers, not sponsorship perks.

An access provision can carry a named add-on card too: "Captioning Sponsor" ("live captioning presented by ..."). Print it with its boundary - visibility on the captioning line only, no say over the program or what gets captioned - and never print it as the condition for captioning to exist; the provision is budgeted whether or not the card sells (see `samber/dev-event-organizer-skills@event-accessibility-inclusion` § Who funds it).

## Perk stacking against objections

Map each perk to a real sponsor concern rather than piling on extras. Organizer guidance names four:

- **Attendee Value** - is this audience a fit.
- **Who else is sponsoring**.
- **Package Value** - money's worth.
- Gut feel.

A tier that only lists logo placements answers none of them. One that adds a sponsor chat channel or a workshop slot answers Package Value directly. Ceiling: 3-7 named perk items per tier before the table stops being readable (the worked table above holds ~10 line items total across 5 tiers, most cells blank).

## Perk catalog by sponsor motivation

Conference surfaces appear in the worked table above. Hackathon-specific perks (slot these into the same table/add-on structure, per the skill body's hackathon note):

- **Sponsored prize track** - matched to the sponsor's product ("Best Use of X", kept general to preserve hacker creativity) or a general theme. Match prize value to the organizer's own prizes so no track overshadows another.
- **Sponsor interactions** - a challenge-familiar representative on-site to mentor (the guide states this often improves both project quality and sponsor satisfaction), plus a dedicated sponsor chat channel monitored throughout.
- **Workshops** - sponsor-run sessions (resume building, interview prep, intro to their API). Scheduling constraint worth printing: hold them early in the event, not the final day - participants are too exhausted by then for anything but submission prep.
- **Fun and games** - sponsor-vs-participant mini-events for sponsors uninterested in technical workshops. Sponsors often don't realize they're welcome, so the perk includes an active invitation.
- **Recruiting formats** - resume-critique office hours, a dedicated recruiter fair space, on-site interviews in a private room. At community-run events these are conversation-based, never scanned-data-based - say so in the row.

## Scarcity: the never-do list

Two scarcity mechanics are honest:

- A **published capacity cap** the organizer can prove: floor space, a single lanyard, the "Max. available" row above.
- A **real edition close date**: a genuine fixed event date.

Both appear in real prospectuses. Sold-out surfaces marked as filled are the same mechanic.

Never, because each one is a dark pattern in this domain:

- A cap that isn't real, printed to pressure.
- A stale "X left" counter left running past the point it's true - re-verify every printed cap in the per-edition refresh.
- A fake countdown or manufactured waitlist.
- Any guarantee, of any of the five general types (unconditional, conditional, anti-guarantee, implied, performance-based) - a performance guarantee contradicts the published honesty constraint. This is the one part of the offer-construction toolkit to reject wholesale, with the reason stated, so a future editor doesn't reintroduce it.

The clearest real counterexample found across conference and hackathon documents is GoatHacks 2023 (a university ACM-chapter hackathon), whose recruiting section states "you will be given the resumes and contact information of all participating students" and whose tier table shows the same "receive resumes" row checked at every tier, Bronze through Title Sponsor, with no cap or hedge word ("access to", "up to"). It never uses the word guarantee, but an unconditional, uncapped promise of the full attendee cohort's contact data is functionally the same commitment this rule exists to block - the shape to catch even when the trigger word is absent.
