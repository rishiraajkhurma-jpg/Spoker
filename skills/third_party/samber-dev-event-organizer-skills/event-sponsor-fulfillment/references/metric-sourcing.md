# Sourcing every number in the sponsor report

Read this before the event, to plan the counts, and again before filling report sections 3-5. Each metric: what to set up before doors open, how to count it, what it proves, what it cannot prove, and the dishonest move to refuse.

## Contents

- The method line
- Metric by metric
- Notes that change what you can report
- Survey questions about sponsors
- Banned numbers

## The method line

Under every figure, one line: `source · count rule · pull date · n / response rate · cannot prove: ...`

```
// ✓ Good - the sponsor's analyst can re-derive it and knows its limit
Booth leads: 187 unique (212 scans)
  lead app export · dedup by badge ID · consented only · pulled 14 Oct · cannot prove: intent or pipeline

// ✗ Bad - no source, no rule, an inflated unit
Booth engagement: 2,000+ interactions
```

## Metric by metric

| Metric | Set up before doors open | Count rule | Proves | Cannot prove | Refuse |
| ------ | ------------------------ | ---------- | ------ | ------------ | ------ |
| Leads / badge scans (company-run) | lead app, consent wording, dedup rule | total and unique (dedup by badge ID); per staffed hour; share with qualifier answers | how many attendees consented to a contact exchange | intent, quality, pipeline | duplicate scans; unconsented scans |
| Opt-in contacts (community-run) | on-site form or raffle naming the receiving sponsor | unique opt-ins per sponsor | consent to that one sponsor | interest beyond the prize | any list without per-sponsor consent |
| Attendance | check-in method | registrations, check-ins (unique badge pickup), peak concurrent, staff excluded | audience size | that anyone saw this sponsor | registrations quoted as attendance |
| Audience profile | registration fields | per-field response rate | self-reported mix | buying authority from a title | hiding "prefer not to answer" |
| Booth traffic | same sampled hours for every booth, named counter | per sampled hour, people present, method stated | traffic in sampled windows | dwell, repeat visits, who | extrapolating to the day; reporting traffic never counted |
| Session / talk / workshop attendance | counter per room | door count at a fixed minute (e.g. minute 5) | room draw | engagement, lead quality | room capacity as attendance |
| Recording views | publication date known | views, watch time, average view duration at a stated day after publication; pull date | playback by the platform's definition | who watched; whether the sponsor slide was seen | windows mixed across talks |
| Hackathon prize track / API use | judging form field "sponsor tech used" | submissions using the sponsor's tech; mentor sessions held | adoption during the event | quality, continued use | counting sign-ups to the track as usage |
| Online / hybrid | platform export access | unique session viewers, virtual-booth visitors | reach on the platform | attention | page views as visitors |
| Social and brand reach | analytics access per platform | reach, impressions, engagements of own posts naming the sponsor, date range | displays and unique accounts per platform | attention, people | summing across platforms; attendees x placements |
| Media coverage | coverage tracker | list of articles with links, reconciled once | coverage existed | readership | two counts in one report |
| Photos | photographer brief with sponsor shot list, opt-out marker | timestamped, peak hours, contract row in filename | the placement existed | attention or impact | empty-hall or stock shots |
| Attendee feedback about the sponsor | questions in the feedback survey, decoy company | n and response rate on every figure | what respondents say | non-respondents | extrapolating a small response to the audience |
| Sponsor-side outcomes (pipeline, signups, hires) | ask at the sale what they measure | only what the sponsor shares | what they choose to share | - | estimating them for the sponsor |

## Notes that change what you can report

- **The privacy model decides the lead rows.** DevOpsDays never distributes attendee contact information and tells sponsors not to expect badge scanning; a community event like it reports opt-ins and aggregate profile only. KubeCon shares scanned attendees' name, title, company, email and work address (never phones); a company-run event like it reports scans with the dedup and consent rule.
- **Hand-off hygiene.** Transfer opt-in contacts through a secured channel, state that the sponsor holds them from receipt, and delete your copy on a stated date. Never hand any contact data to a champion who has left the sponsor.
- **Sponsor staff inflate the audience.** CNCF's KubeCon North America 2025 transparency report counted sponsor-staff badges at 33% of registrations. Strip them out before any audience figure goes to a sponsor.
- **Manual counts undercount.** A peer-reviewed pedestrian-count comparison (street counts, not booths) found clicker and sheet counts 8-25% below video, worst at peaks. Say "sampled, likely undercounted" rather than adjusting upward.
- **YouTube's "view" threshold is not published.** The 30-second figure circulating online is folklore; watch time and average view duration are the defensible rows.
- **Outputs, not outcomes.** IEG's measurement guidance separates what the sponsor got (outputs) from what it produced (outcomes): 200,000 attendees shows the event's popularity, not how the brand fared. An organizer can prove outputs; ask the sponsor for outcomes.

## Survey questions about sponsors

No organizer guide publishes sponsor-question wording. This set is constructed on IEG's aware-vs-unaware logic. Send it to the attendee survey owned by `samber/dev-event-organizer-skills@event-feedback` before that survey freezes, and ask its owner to close it by business day 7 so the stage-2 report can carry it; do not field a second survey.

1. Unaided recall: "Which sponsors of [event] do you remember?" (free text)
2. Aided recall: the sponsor list plus one company that did not sponsor. The decoy's recall rate is the guessing baseline; report both. No decoy fielded: say no baseline was subtracted.
3. Interaction: "Did you talk with [sponsor] staff / attend their session / use their API or prize track?" (per sponsor, multi-select)
4. Perception shift: "After [event], my view of [sponsor] is: much worse ... much better" (5-point)

Keep contact opt-ins out of this survey: an opt-in needs an identity, and attaching one breaks the survey's anonymity. Collect them on site or in a separate form not linked to survey answers. At a many-sponsor event, rotate sponsors across respondents rather than asking every question about every sponsor (a self-set rule): length costs completion on every other question too.

## Banned numbers

- **Advertising value equivalent, "earned media value", "media value" in currency.** The communications-measurement standard (AMEC Barcelona Principles 4.0, 2025) says these "should not be used", under every alias (AVE, EMV, ACE, EAV, MAV, PRV). Practitioners often multiply them by an invented 3-10x credibility factor.
- **"Brand impressions" computed as attendees x placements x days.** It counts nothing that happened.
- **Industry renewal or ROI benchmarks quoted at the sponsor.** The circulating "62% average sponsor renewal" traces to no published study.
