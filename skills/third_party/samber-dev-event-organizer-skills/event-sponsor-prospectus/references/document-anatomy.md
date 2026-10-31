# Prospectus document anatomy

The generalized section order, a worked example, and the reasoning behind the ordering.

## The generalized order

Emotion/brand → facts → value proposition → proof → price → upsell → logistics → named humans. Two rules inside it:

1. **Proof precedes price.** The reader should already believe the event is credible by the time a number appears. Real documents agree on it: the DevOpsDays Graz kit places its testimonials page directly before its tier table, and general B2B pitch-deck frameworks arrive at the same proof-before-pricing, CTA-last sequence from unrelated reasoning.
2. **Open on the event's credibility, not the sponsor's pain.** Generic pitch-deck frameworks open on the buyer's problem. The real prospectus opens on brand and facts. A prospectus sells the event's credibility, not a solution to a pain point - follow the real document's opening, not the framework's.

Cap the document around 10-12 pages. Past that, it risks going unread (the worked example below is 9 pages including cover and team page).

## Worked example: a live 9-page community-conference kit

DevOpsDays Graz 2026 sponsorship kit is a real, dated PDF for a ~300-attendee community-run conference. Page by page:

1. **Cover** - event dates, logo, "Sponsor Information 2026", website URL. No pricing, no call to action yet.
2. **Full-bleed emotional photo** - a crowd photo, color overlay, one tagline ("become part of the movement"). Pure brand, zero information density.
3. **Photo collage** - ~10 candid event photos (speakers, audience, booths), no text. Social proof by imagery before a single word of pitch.
4. **About** - event description, then three labeled facts as sub-headers:
   - **When?** - dates and times.
   - **Where?** - venue and the partner providing it.
   - **Who?** - one sentence: "Up to 300 industry professionals, aged 25 to 40 years".

   Closes with a world map pinning the city among the global network's other cities, a network-credibility device.

5. **Your benefits as a sponsor** - value-proposition prose, then three named benefit categories with a line each:
   - Brand Awareness.
   - Recruitment Opportunities.
   - Support Community and Diversity.

   Ends with a prior-year sponsor logo wall.

6. **Testimonials** ("Last Year Said It Best") - screenshotted social posts and pull-quotes from last edition's attendees and sponsors, plus one press callout. The proof page, deliberately before the price page.
7. **Packages overview** - the tier table, closing with a custom-tier invitation and a bolded contact-email call to action on the same page as the table.
8. **Add-on packages** - six named à-la-carte perks as icon + name + price + one-line cards in a two-column grid.
9. **Team & contact** - organizer headshots, one-paragraph bios, social links. Named humans close the deck, not a generic form.

Pages 4-6 present content `samber/dev-event-organizer-skills@event-sponsor-value-proposition` produced. Page 7's numbers come from `samber/dev-event-organizer-skills@event-sponsor-pricing`. The prospectus's own work is everything about how they are ordered, shown, and refreshed.

## Worked example: a real 5-page hackathon kit

Cal Hacks 13.0 (Hackathons@Berkeley, a large independently-run collegiate hackathon) publishes a dated sponsorship PDF that mirrors the conference anatomy closely. Page by page:

1. **Cover** - event name, dates, venue, one tagline ("Your guide to making a mark at the world's largest collegiate hackathon"), a note that payments are 501(c)(3) donations.
2. **Package perks (the tier table)** - four tiers (Bronze $10K, Silver $20K, Golden Bear $35K, Anchor $50K), rows grouped by sponsor motivation (Recruiting, Marketing, Technology, Co-Host Special Benefits), closing with two named ASK-priced add-ons ("Sponsor an activity", "Sponsor a snack/meal").
3. **Event facts and value proposition** - a "Why Sponsor?" bullet list, then six verified-number stat tiles (3,000+ hackers, 50+ majors, 300 universities, 15+ countries, 1,200+ beginner hackers, 1,000+ female/non-binary/gender-queer hackers).
4. **Testimonials** - three named-sponsor pull-quotes (Otto, Zepp Health, Vapi), each attributed to a specific past edition.
5. **Past partners and contact** - a dense sponsor-logo wall (Anthropic, Visa, Y Combinator, and dozens more), closing with an email and site link.

One structural deviation from the conference default: the tier table (page 2) precedes the proof and testimonials (pages 3-4), reversing the proof-before-price rule the conference documents establish. Treat this as a real, sourced hackathon variant, not a reason to drop the conference default - validate page order with the organizer rather than assuming either pattern.

MLH-affiliated campus hackathons (HackMIT, PennApps, TreeHacks) still route sponsors to email rather than publishing a PDF of this depth, consistent with MLH's own organizer guidance: a prospectus "should" be "2-3 pages long" because "sponsors generally don't have time to read through a big sponsorship deck." An independently-run hackathon publishing a fuller kit regardless shows MLH's thin-deck advice is one real input, not the only one - weigh it against the organizer's own scale and effort ceiling (Q6-Q8) before picking a depth rung.

## The logistics FAQ section

A sponsor FAQ is a recognized part of the anatomy, even where an event leaves it unfilled: the Graz sponsor page's own markup carries a commented-out, blank "Sponsor FAQ" grid whose question list is real and reusable. Use it as a closing section of the kit, or as a separate operational one-pager sent after signature:

- Booth set-up and tear-down windows
- Shipping materials to and from the venue (address, deadlines, return pickup)
- Who to send (how many staff, what profile works at this event)
- Electricity at the booth
- WiFi (dedicated network or shared attendee network)
- A/V ordering for sponsored surfaces

Answering these in the document saves a reply-to-ask exchange per sponsor. `samber/dev-event-organizer-skills@event-sponsor-fulfillment` owns actually delivering them.

## What real prospectuses deliberately leave out

- **No guarantee clause of any type** - this kit, PyCon US, DjangoCon US and Cal Hacks 13.0 all omit one. This is a signal, not an oversight: a performance guarantee contradicts the honesty constraint the organizers themselves publish.
- **No lead-data benefit at the community pole** - no attendee list or badge-scan row appears anywhere in this kit's table or add-ons, consistent with the organizer network's published rule that attendee contact data is never given or sold.
- **Hackathon anatomy is only partly evidenced** - Cal Hacks 13.0 confirms a full conference-style anatomy is real for a large independent hackathon; MLH-affiliated campus events still don't publish one. See the hackathon note in the skill body and the worked example above.

## Adapting the anatomy by depth rung

- **In-page tier-table page**: compress to facts paragraph → short value-prop paragraph → tier grid → contact email. Keep proof (a logo wall, one quote) above the grid even in the compressed form, applying the proof-before-price rule to the smaller canvas.
- **Text one-pager**: the three facts sponsors always ask about (what audience, why sponsor, what per level), a price summary, a contact. Nothing else.
- **Full kit**: the 9-page order above, with the photo pages contingent on real photo assets. A first edition substitutes the organizers' own community track record for pages 2-3 rather than stock imagery (stock photos of someone else's event are a credibility risk a diligent sponsor can spot).
