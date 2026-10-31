# Sponsor objection handling

The response structure is built from four concerns sponsors weigh before saying yes (MLH organizer guide; DevOpsDays guide):

- Attendee value.
- Who else is sponsoring.
- Package value.
- Organizer competence.

Rows built by inference are flagged inline.

## The five-field structure

Document every objection in the same five fields:

1. **Objection statement** - exactly how it's said, not a paraphrase.
2. **Why they say it** - the real concern under the words.
3. **Response approach** - acknowledge without conceding, then redirect.
4. **Proof point** - the specific evidence for this exact concern.
5. **Follow-up question** - keeps the conversation moving instead of ending on the rebuttal.

Deliver it in two formats: a **quick-reference table** (objection / one-line response / proof point) scannable mid-call, and a **detailed prep doc** (full talk track) for a new organizer ramping up. The framework's six categories carry over except one: its "Technical" category (integration and compatibility objections) has no sponsor equivalent - drop it rather than force-fit it.

## Prevention before handling

Most sponsor "objections" are unanswered operational questions. Have the fixed checklist ready _before_ outreach:

- Projected attendee count.
- Industries and companies represented (in aggregate only, never a named list).
- What each sponsorship level includes.
- Electricity, network, and monitor availability.
- Shipping logistics.
- Table size and placement.

A sponsor who has to chase these answers reads the event as poorly run: the competence concern working against you before price is even discussed.

## The sponsor objection set

| Objection                                               | The real concern                                                                             | Response approach                                                                                                                                                                                        | Proof point                                                                 | Follow-up question                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "Our budget for this year is already committed."        | Timing, not rejection - sponsor budgets lock in the fiscal year prior.                       | Accept the timing; ask when next cycle's planning happens and get on that radar now.                                                                                                                     | The T-8-month outreach practice exists precisely because of this lock-in.   | "Which month does your team plan next year's event budget?"                                 |
| "How do we know your audience is worth it?"             | Attendee value - is this crowd a fit for their goal?                                         | Answer with aggregate composition (roles, seniority, company sizes), never impressions or a contact list.                                                                                                | Registration-form demographics; past-edition aggregate data.                | "Which role and seniority mix would make this a clear yes for you?"                         |
| "Who else is sponsoring?"                               | Competitor co-presence cuts both ways - a validation signal for some, a conflict for others. | Answer honestly with the current roster; at a community event, frame breadth as amplification - many sponsors signals the community's ideas have broad backing.                                          | The current sponsor roster; returning-sponsor rate.                         | "Is a competitor's presence a draw or a blocker for you?"                                   |
| "We don't see the value of sponsoring this."            | No need named yet - the sponsor cannot see the fit unprompted; not a price objection.        | Stop presenting; run discovery: ask what the company needs from events this year and map it onto the value categories. If no category carries it honestly, say so.                                       | The value-proposition statement for the segment the need maps to.           | "What would your team need to walk away with for an event like this to be worth it?"        |
| "It's too expensive." / "What do we actually get?"      | Package value - the value isn't legible yet, not literal unaffordability.                    | Walk the package against the success metric _they_ named on the exploratory call, not against the perk list.                                                                                             | The per-level benefits table; the returning-sponsor rate.                   | "Against the metric you used last time - what would this need to deliver to be worth it?"   |
| "Can we get a speaking slot with the sponsorship?"      | They're used to vendor events where stage time is purchasable.                               | At a community-run event: no - slots are never sold; point to the CFP or an open-space/topic-suggestion path. At a company-run event this is a package question, not an objection.                       | The published rule - sponsors can verify it in the CFP or event guidelines. | "Would a CFP submission from one of your engineers interest your team?"                     |
| "Can we scan badges or get the attendee list?"          | They price sponsorships in leads.                                                            | At a community-run event: never given or sold; offer aggregate demographics and conversation-based formats instead. At a company-run event, consented lead retrieval may exist - say which pole applies. | The published no-list rule; the aggregate demographics you can share.       | "If lead capture is the goal, what did volunteered conversations yield at your last event?" |
| "We sponsored an event once and got nothing out of it." | Status quo - a past sponsorship with no measured outcome.                                    | Ask what success metric they used then; propose agreeing one measurable goal for this sponsorship before signing.                                                                                        | The post-event sponsor report your fulfillment process commits to.          | "What would you want the post-event report to show?"                                        |
| "I'm not the budget owner."                             | Authority - wrong recipient, not wrong pitch.                                                | Thank them and convert it into a referral: ask who the right person is, ideally a forwarded introduction.                                                                                                |                                                                             | "Could you forward this to them, or should I write to them directly mentioning you?"        |

## Feeding the log back

Tag every objection heard with the sponsor's segment and log it. A recurring objection is a defect in that segment's value-proposition statement, not a sales problem - `samber/dev-event-organizer-skills@event-sponsor-value-proposition`'s measurement section consumes this log. Objections that recur across _all_ segments (usually timing) are a calendar problem: outreach started too late in the fiscal cycle.
