# Term sheet: output shape

The artifact this skill produces. It is a **term sheet for counsel review - not a contract, not signable, not legal advice.** That statement belongs at the top of the document itself, not only in the conversation that produced it, because the document is what gets forwarded.

The structure below adapts the repository's generic 14-section sponsorship-agreement template into a form that carries decisions and their evidence rather than blanks. The difference matters: a template full of `[bracketed placeholders]` invites someone to fill them in and sign; a term sheet states what was chosen, why, and what is still open.

## Contents

1. Document header
2. Section list with counsel flags
3. The deliverables exhibit
4. Worked example of one section
5. Negative example
6. Counsel handoff note

## 1. Document header

Open with four things, in this order:

1. **The constraint.** "This is a term sheet prepared for review by a qualified lawyer in [jurisdiction]. It is not a contract and not legal advice. Do not sign it."
2. **The parties and the event** - organizer legal entity (or a flag that none exists yet), sponsor legal entity, event name, edition, dates, format.
3. **What was sold** - tier, fee, and a pointer to the exhibit.
4. **A legend for the flags** used through the document.

Three flags carry the whole document's honesty:

- 🟢 **Decided** - a choice was made and an example backs it. Names the source.
- 🟠 **Open** - a decision the organizer still owes, with the options and the trade-off stated.
- 🔴 **Counsel** - jurisdiction-dependent, or beyond what any example can settle. Governing law, data protection, indemnity scope and enforceability of any liquidated-damages figure always land here.

## 2. Section list with counsel flags

Every section below is either drafted or explicitly marked not applicable with a reason. A silently skipped section is indistinguishable from a forgotten one, which is why the coverage measure counts both.

| #   | Section                                         | Usual flag | Note                                                                                |
| --- | ----------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| 1   | Parties and event                               | 🟠         | Unincorporated organizers are a structural exposure, not a drafting problem         |
| 2   | Sponsorship package and fee                     | 🟢         | Traces to the rate card; never re-priced here                                       |
| 3   | Deliverables exhibit                            | 🟢         | See §3 below - the most consequential part of the document                          |
| 4   | Payment schedule                                | 🟢         | Menu choice, plus the always-drafted late-fee and non-payment clauses               |
| 5   | Sponsor withdrawal                              | 🟢         | Dated, never discretionary                                                          |
| 6   | Organizer cancellation                          | 🟢         | Separate clause, narrower remedy                                                    |
| 7   | Force majeure                                   | 🟢         | Trigger list and remedy are two separate decisions; both named in words             |
| 8   | Liability and indemnification                   | 🔴         | Two real shapes exist; scope is negotiated, and the cap's enforceability is local   |
| 9   | Insurance                                       | 🟢         | Menu choice, gated on event scale; certificate deadline named or the clause dropped |
| 10  | Code of conduct and ejection right              | 🟢         | Default, with the no-refund consequence in the same clause                          |
| 11  | Editorial independence                          | 🟢         | Default; sponsor gets no say over speakers, topics or content                       |
| 12  | Logo and brand licensing                        | 🟢         | Reciprocal, promotion-only, auto-expiring                                           |
| 13  | Category exclusivity                            | 🟠         | Only if sold; all three enforceability elements or none                             |
| 14  | Attendee data                                   | 🟠/🔴      | Usually "not applicable - no lead benefit was sold"; 🔴 the moment one was          |
| 15  | Confidentiality                                 | 🟠         | Counsel usually has a house position                                                |
| 16  | Term, cure period, termination, renewal         | 🟢         | 30-day cure default; renewal by exhibit replacement                                 |
| 17  | Governing law, jurisdiction, dispute resolution | 🔴         | The most jurisdiction-dependent section in the document                             |
| 18  | General provisions                              | 🟠         | Entire agreement, amendments, assignment, severability, notices                     |
| 19  | Signature block                                 | 🔴         | Present as a placeholder only, after counsel review                                 |

## 3. The deliverables exhibit

One row per sold perk. This exhibit is what `samber/dev-event-organizer-skills@event-sponsor-fulfillment` tracks against and what a dispute is read against, so it is worth more care than the legal sections an organizer will hand to a lawyer anyway.

| Perk                            | Specification                               | Surface      | Hard deadline                         | Responsible                            | Source               |
| ------------------------------- | ------------------------------------------- | ------------ | ------------------------------------- | -------------------------------------- | -------------------- |
| Logo on event website           | Sponsor page, tier-sized placement          | Website      | Asset due 2026-03-01, live 2026-03-08 | Organizer (placement), Sponsor (asset) | Gold tier, rate card |
| Logo on printed lanyard         | Single colour, vector required              | Print        | Asset due 2026-02-14 - printer lock   | Sponsor                                | Gold tier, rate card |
| Booth space                     | 3×2m, power 2kW, shared WiFi                | On-site      | Setup window 2026-04-09 07:00-09:00   | Organizer                              | Gold tier, rate card |
| Full-access passes              | 4, non-transferable                         | Registration | Codes issued 2026-03-15               | Organizer                              | Gold tier, rate card |
| Aggregate audience demographics | Role, seniority, company-size mix; no names | Document     | Event + 7 days                        | Organizer                              | Gold tier, rate card |

Four rules govern this table:

- **Every row cites its source.** A perk with no rate-card or accepted-proposal origin does not belong in the contract.
- **Deadlines are the real ones.** The printer's date, not the event date - a logo missed at the print lock is unfixable afterwards.
- **Responsibility is named per row**, including the sponsor's own asset obligations. Most deliverable failures are the sponsor missing an asset deadline, and a contract that only obliges the organizer has no answer for it.
- **Negotiated deltas live here**, not in the body, so the renewal mechanic can replace the exhibit cleanly.

## 4. Worked example of one section

> **7. Force majeure** 🟢
>
> **Trigger events (drafted).** Fire, flood, earthquake, natural disaster, war, terrorism, sabotage, strike, epidemic, pandemic, government order or public-health directive, venue destruction, sustained utility or network failure.
>
> **Remedy (drafted - pro-rata net of documented expenses).** If the event cannot be held, the organizer refunds the sponsor's proportionate share of fees received after deducting expenses already incurred, within 45 days of the cancellation notice.
>
> _Why this rung:_ volunteer-run event, no reserve to absorb a full refund; matches the shape used in a real published conference contract (PyCon US 2020). _Considered and not chosen:_ sponsor-elected credit toward the next edition (Linux Foundation 2021, 14-day election window) - revisit once edition three is confirmed, since it retains both the cash and the sponsor.
>
> _Why the remedy is written out rather than implied:_ in _NetOne v. Panache_ (D. Haw. 2020) a refund was denied on a clause that did not name one; in _Sanders v. Edison Ballroom_ (N.Y. Sup. Ct. 2021) a $45,219.28 refund was ordered on a clause that did. The text decides the outcome.
>
> 🔴 **For counsel:** whether "expenses already incurred" needs itemisation or a documentation standard to be enforceable locally; whether postponement should be a third branch with its own remedy rather than folded into cancellation.

That is the shape: the decision, the evidence, the alternative considered, and the open question named rather than buried.

## 5. Negative example

The same section drafted the way it usually goes wrong:

> **7. Force Majeure**
>
> Neither party shall be liable for any failure or delay in performance due to causes beyond its reasonable control, including acts of God, war, terrorism, strike, or government action. The parties shall discuss an equitable resolution in good faith.

Four things are wrong here, and they compound:

- **No remedy is named.** "Discuss in good faith" is the silence _NetOne_ read as no refund. A sponsor believing this clause protects its deposit believes something the text does not say.
- **The trigger list is generic.** No pandemic, no epidemic, no public-health order - the omission that produced years of litigation after 2020.
- **It is symmetric.** One clause covering both directions grants the sponsor a remedy against the organizer identical to the organizer's against the sponsor, which no real contract in this space does.
- **It reads finished.** No flags, no citations, nothing signalling that a lawyer still has to look at it - so nobody does.

## 6. Counsel handoff note

Close the document with a short note addressed to the lawyer, not to the organizer. It should say:

- What the term sheet is and is not.
- Which sections were drafted from real published examples and which are the organizer's own decisions.
- Every 🔴 flag, collected into one list.
- The jurisdiction, the contracting entity, and whether that entity actually exists yet.
- The date the first sponsor is expected to sign.

Naming that date matters more than it looks: a term sheet arriving after the organizer has already asked a sponsor to sign has failed at the one thing it exists to do.
