# Audience evidence, distribution formats, and update cadence

## The two audience-evidence models

A diligent sponsor's first question is audience composition, not headcount - "2,000 attendees" says nothing until it is split. Two real documents mark the depth range:

**The composition breakdown.** The PyCon US 2026 prospectus provides a model. Alongside its tier table, it prints:

- Total attendee count: 2,500+.
- Talk and track counts, expo booth count, job-fair table count.
- A job-function breakdown: 53.9% Developer, followed by Analyst, Architect, Director, Engineering Manager, Product Manager, Consultant, Designer, Other.
- An industry breakdown: Software 43%, Finance 13%, Education 10%, Healthcare 6%, Government 4%, Consultancy 4%, Manufacturing 3%, Retail 2%, Insurance 2%, Nonprofit 2%, Other 11%.
- A company-size band split.

Role mix, industry mix, size mix: each as a labeled percentage table, not a single number.

**The one-liner floor.** One sentence: "Up to 300 industry professionals, aged 25 to 40 years" (from DevOpsDays Graz 2026 kit). A small or first-edition community event may genuinely not have surveyed finely enough for a breakdown. Print whatever composition data is real, even a rough band, rather than fabricating percentages to match a bigger event's table shape.

## The verification rule

The PyCon document itself demonstrates the trap: its company-size percentages (25%/55%/20%) are printed, but which band each number belongs to is not clearly resolvable from the PDF's layout, so the discipline is to not quote the mapping.

Generalized rule for any prospectus this skill builds:

- Print every demographic split you can verify precisely.
- Never publish a breakdown whose category-to-number mapping you can't confirm.

A garbled table is a worse credibility signal than fewer categories shown correctly.

Aggregate demographics are also the honest substitute for lead data at a community-run event - the organizer network's own guide says to "share demographics in aggregate to give sponsors a feel for what kind of crowd will attend" while never giving out contact lists.

## Distribution formats

From the DevOpsDays network's own site:

- **The network's org-level page carries no tier table at all** - policy prose only, deferring pricing and prospectus to each event ("Events set their own rates... Check their pages for a prospectus"). Community events publish per-event documents, not a network-wide ladder.
- **The dominant pattern: web stub → PDF kit.** The live sponsor page an actual prospect lands on is four short paragraphs plus one button - a value-prop paragraph, a mailto link, and a "Check out our sponsorship kit!" button to a downloadable PDF hosted on the event's own domain. The real prospectus lives entirely in the PDF.
- **The in-page HTML tier table is a real, previously-tried format**: the same page's source contains a complete HTML tier grid (three tiers, feature rows, highlighted cells) that was built and then commented out in favor of the PDF kit. It remains the right rung for an event with no design capacity - same row/column structure as the PDF's table, no layout work.
- **Quote-gated, no public document** exists as a pattern at network/portfolio scale - MLH publishes reach numbers and a contact form, no kit. That is a pricing-strategy decision made in `samber/dev-event-organizer-skills@event-sponsor-pricing`, not a distribution rung this skill picks on its own.

Host the PDF on the event's own domain and link it from the sponsor page. Email the same file in outreach so every prospect reads an identical, versioned document.

## Update cadence per edition

The cadence is per-edition freshness, not evergreen editing:

- A **fresh, dated document per edition** - the kit's own title is "Sponsor Information **2026**", and each event publishes a new sponsor page per edition rather than editing one page in place.
- **Testimonials refreshed per edition** - the proof page is explicitly framed as last edition's voices ("Last Year Said It Best"), which only works if it is actually refreshed.
- Refresh checklist before each edition's first send:
  - Edition year in title and filename.
  - Prices and tiers match `samber/dev-event-organizer-skills@event-sponsor-pricing`'s current ladder.
  - Every printed cap re-verified against real inventory.
  - Testimonials, photos, and logo wall from the latest edition.
  - The audience-evidence section updated with the latest registration data.
  - Dead links and old dates swept.
- Archive the previous edition's document rather than overwriting it - the year-over-year diff is evidence of growth a returning sponsor can be shown.
