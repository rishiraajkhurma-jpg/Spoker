# Event profile template (filled by A0, read by every agent)

Fill every field. Leave `UNKNOWN` rather than guessing; agents will refuse to print a number marked UNKNOWN.

```yaml
event_id: esummit-2027
name: E-Summit 2027
organizer: E-Cell, IIT Bombay
edition: 19th
dates: 2027-01-23 to 2027-01-25
city: Mumbai (IIT Bombay campus, Powai)
one_line: "Asia's largest business school-free entrepreneurship summit: founders, VCs and 20,000+ students in one weekend."   # only if true
website: https://www.ecell.in/esummit

audience:                 # every figure needs a source in sources[]
  footfall_total: UNKNOWN
  unique_registrations: UNKNOWN
  pct_students: UNKNOWN
  pct_working_professionals: UNKNOWN
  top_colleges: [IIT Bombay, ...]
  disciplines: {engineering: UNKNOWN, management: UNKNOWN, design: UNKNOWN}
  founders_attending: UNKNOWN
  investors_attending: UNKNOWN
  geography: "Mumbai 60%, rest of India 40%"   # example format
reach:
  instagram_followers: UNKNOWN
  linkedin_followers: UNKNOWN
  youtube_subscribers: UNKNOWN
  last_edition_impressions: UNKNOWN
  email_list_size: UNKNOWN
past_sponsors: [ ... ]            # with year, tier if known
flagship_properties:              # named things a sponsor can attach to
  - Startup Expo (200 startups)
  - Pitch competition (prize pool)
  - Speaker sessions
  - Internship fair
  - Hackathon
sources:
  - {fact: footfall_total, source: "post-event report 2026", date: 2026-02-10}

inventory:                        # what we can actually deliver
  - id: title_naming     ; desc: "Event title: '<Brand> presents E-Summit'"; max: 1
  - id: stage_branding   ; desc: "Main stage backdrop logo"
  - id: booth            ; desc: "3x3 m booth in Expo"; max: 30
  - id: speaking_slot    ; desc: "Fireside / panel seat"; note: "only via curation, never sold outright if policy says so"
  - id: workshop         ; desc: "60 min workshop room"
  - id: hiring_corner    ; desc: "Internship fair table + resume book (opt-in only)"
  - id: social_posts     ; desc: "Dedicated Instagram/LinkedIn posts"
  - id: reel             ; desc: "Co-branded reel"
  - id: merch_logo       ; desc: "Logo on T-shirts / kits"
  - id: emailer          ; desc: "Mention in registration emails"
  - id: prize_naming     ; desc: "'<Brand> Pitch Prize'"
  - id: product_sampling ; desc: "Sampling at entry / goodie bags"

tiers:                            # A0 fills prices; manager locks
  Title:    {price_inr: UNKNOWN, count: 1, includes: [title_naming, stage_branding, booth, speaking_slot, social_posts x6, reel x2, merch_logo, emailer]}
  Platinum: {price_inr: UNKNOWN, count: 2, includes: [...]}
  Gold:     {price_inr: UNKNOWN, count: 4, includes: [...]}
  Silver:   {price_inr: UNKNOWN, count: 8, includes: [...]}
  In-kind:  {value_floor_inr: UNKNOWN, includes: [...]}
last_year_closed: [{company: '', tier: '', cash_inr: 0, in_kind_inr: 0}]   # actual closes, the basis for floors
peer_rate_cards: [{fest: '', tier: '', price_inr: 0, source: ''}]
floor_inr: UNKNOWN                # smallest cash deal we accept (from history and peers, not cost)
floor_locked_by: ""
revenue_goal_inr: UNKNOWN

sender:
  name: ""
  title: "Marketing Manager, E-Summit 2027"
  org: "E-Cell, IIT Bombay"
  phone: "+91 ..."
  email: ""
  website: ""
  postal_address: "E-Cell, IIT Bombay, Powai, Mumbai 400076"   # required in cold email signature
team_liaisons: [{name: "", phone: "", email: ""}]
policies:
  exclusivity_allowed: "category exclusivity only at Title/Platinum, manager approval"
  never_promise: ["attendee contact lists without opt-in", "guaranteed footfall at booth", "judging influence"]
  payment_terms: "50% on MOU, 50% 15 days before event"
  gst_mode: UNKNOWN           # forward (invoicing entity is a body corporate, add GST line) | reverse (sponsor pays under RCM). Confirm with accounts office.
collaboration_models_offered: [cash_tiers, property_naming, brand_integration, activation, hiring, case_competition, workshop, product, services, opportunity, logistics, media, offers, revenue_share]
inkind_needs:                 # what we would otherwise pay for; cost_avoided_inr from real quotes
  - {item: "Lunch for 2,000 attendees x 2 days", cost_avoided_inr: UNKNOWN, audience_benefit: "free meals"}
  - {item: "Prizes for pitch competition", cost_avoided_inr: UNKNOWN, audience_benefit: "bigger prize pool"}
  - {item: "Cloud/AI credits for 200 startups", cost_avoided_inr: 0, audience_benefit: "startups get credits"}
  - {item: "Internships / fast-track interviews for winners", cost_avoided_inr: 0, audience_benefit: "jobs"}
  - {item: "Cab credits for speakers", cost_avoided_inr: UNKNOWN, audience_benefit: ""}
  - {item: "Printing (standees, badges)", cost_avoided_inr: UNKNOWN, audience_benefit: ""}
inkind_max_share_of_tier: 0.5
  invoice_entity: ""          # the legal entity that invoices (institute account / society)
  signatory: {name: "", title: "", turnaround_working_days: UNKNOWN}
  tds_expected_pct: UNKNOWN   # what sponsors usually deduct (commonly 2% for sponsorship as a contract); confirm with accounts
  payment_terms_days: 45      # be ready for net 45-90
  vendor_kit: [pan, gst_certificate, bank_letter, msme_certificate, registration_document, signatory_letter]
  outreach_season: "Jun-Oct for a Jan/Feb event"
  organiser_permission: ""    # written OK from E-Cell / institute to email companies in the event's name
  cross_fest_sheet: ""        # link to the institute-wide 'already in conversation' sheet
```
