# SponsorDesk state schema

Implemented in `scripts/pipeline_db.py` (SQLite, file `sponsordesk.db` next to the working directory unless `SPONSORDESK_DB` is set). If you run on a Google Sheet instead, keep one tab per table with exactly these columns.

## events
| column | meaning |
|---|---|
| event_id | slug, e.g. `esummit-2027` |
| name, dates, city, edition | basics |
| profile_json | full event profile from A0 (audience, reach, inventory, tiers, floor) |
| floor_inr | locked floor price for the smallest cash deal |
| locked_by, locked_at | who approved the floor |

## companies
| column | meaning |
|---|---|
| company_id | slug of domain, e.g. `zepto-com` |
| event_id | |
| name, domain, industry, hq, headcount, funding_stage | firmographics |
| fit_score | 0-100 from A1 |
| our_pov_score, their_pov_score, intersection | the dual-POV scores (see A1) |
| tier_suggested | Title / Platinum / Gold / Silver / In-kind |
| priority | P1 / P2 / P3 |
| reasons_json | list of {claim, source, field, value, date, url} |
| stage | pipeline stage (see SKILL.md) |
| stage_reason | why it is in that stage |
| owner | liaison name on the team |
| meeting_count | increments per meeting |
| updated_at | |

## contacts  (the A2 database the manager asked for)
| column | meaning |
|---|---|
| contact_id | |
| company_id | |
| full_name | |
| position | exact current title |
| seniority | CXO / VP / Director / Manager / IC |
| role_in_deal | budget_owner / champion / referrer / backup |
| email | verified work email |
| email_status | verified / risky / catch_all / invalid / unknown |
| phone | only if public business number |
| linkedin_url | |
| location | |
| one_liner | one sentence any outsider understands, e.g. "Heads brand marketing at Zepto; ran their 2025 campus ambassador program across 40 colleges." |
| linkedin_context | 3-5 bullets of recent, usable context (posts, moves, talks, alma mater, shared connections) with dates |
| personalization_hook | the single best opener fact, with source |
| iitb_alum | yes/no/unknown |
| warm_path | name of the person who can intro, if any |
| source | crustdata / website / referral / manual |
| is_primary | 1 for the one active contact per company |
| status | active / replied / no_response / opted_out / bounced |
| last_verified_at | |

## messages  (every email or LinkedIn draft, sent or not)
| column | meaning |
|---|---|
| message_id | internal id |
| idempotency_key | `{contact_id}:{sequence}:{step}` UNIQUE. This is what prevents double sends |
| contact_id, company_id | |
| to_email | recipient, copied from contacts at queue time |
| body_hash | sha256(body)[:16], used to reconcile with the Sent folder |
| gate | approve / auto (auto only for cold steps 1-2) |
| lint_ok | 1 when email_lint passed at queue time |
| attempts | send attempts; retry stops at 3 |
| channel | email / linkedin_connect / linkedin_dm |
| sequence | cold / meeting / recap / mou / invoice / chase / nurture |
| step | 0 = first touch, 1..2 follow-ups (max 3 cold emails), or a named step |
| subject, body | final text after lint |
| status | drafted / approved / claimed / sent / cancelled / failed |
| gmail_thread_id, gmail_message_id | filled after send |
| scheduled_for | when it may go out |
| sent_at | |
| approved_by | manager name for gated messages |
| cancel_reason | reply / opt_out / bounce / manual |

## replies
| column | meaning |
|---|---|
| reply_id, gmail_message_id (UNIQUE) | |
| contact_id, company_id | |
| received_at | |
| classification | interested / meeting / need_info / referral / not_now / not_interested / opt_out / auto_reply / bounce |
| summary | 1-2 lines |
| suggested_next | what the agent recommends |
| draft_message_id | the drafted response waiting for approval |
| handled | 0/1 |

## meetings
| meeting_id, company_id, n (1st, 2nd...), start_at, end_at, meet_link, calendar_event_id, attendees, deck_path, notes_source, notes_summary, action_items_json, status |

## deals
| company_id, deal_type (cash / in_kind / opportunity / hybrid / revenue_share / performance), models (ids from collaboration-models.md), tier, cash_inr, in_kind_json (item, qty, cost_avoided_inr, delivery_date, delivered), deliverables_json, exclusivity, mou_path, mou_status, signed_at, invoice_no, invoice_amount, gst, due_date, paid_at |

## exceptions  (the manager's inbox)
| exception_id, company_id, kind (approval / below_floor / exclusivity / redline / custom_deliverable / data_conflict / other), question, recommendation, reasons_json, draft_message_id, status (open / approved / rejected / edited), resolved_at, resolution_note |

## log
Append-only: `ts, actor (agent or manager), company_id, action, from_stage, to_stage, detail`.

## What the code enforces (pipeline_db.py), not just the prompts

| Rule | Where | Result when broken |
|---|---|---|
| Email passes lint (no dashes, no placeholders, signature, postal address, opt-out on cold) | `queue` | `REFUSED:lint` |
| Suppressed / opted-out / bounced / erased person is never queued or sent | `queue`, `claim` | `REFUSED:suppressed`, `BLOCKED:suppressed` |
| One live cold thread per company; max 3 cold emails (steps 0, 1, 2) | `queue` | `REFUSED:one_live_thread_per_company`, `REFUSED:cold_step_max_2` |
| No cold email to a company that has replied (per company, not per contact) | `queue`, `claim` | refused / cancelled |
| Only names in `config approvers` can approve; `auto` only for cold follow-ups with no reply | `approve` | `REFUSED:needs_human_approver` |
| Daily caps (30 new, 60 total) and spacing (120 s) | `claim` | `CAP:...`, `WAIT:n` |
| Out-of-office keeps the sequence and pushes it past the return date | `reply ... auto_reply <date>` | |
| A reply on a deal past the cold stages never resets its stage; it raises an exception instead | `reply` | |
| Times without offset are IST; all stored as UTC | everywhere | |

The approver check proves only that a configured name was typed. The orchestrator must use a name only when the manager's own message in chat approves that exact item.

## The no-double-send protocol

1. **Reply sweep first** (per company, all contacts at that company).
2. `queue` (lint + rules) -> `approve` (human or auto rule) -> `claim` (atomic; re-checks suppression, replies, caps, spacing).
3. Send via Gmail in the existing thread, then `sent <key> <thread> <msg>`. For cold steps it prints `NEXT_STEP_NEEDED <key> after <time>`: draft and queue that step in the same run.
4. Send error: `failed`, then `retry` (max 3 attempts, then an exception).
5. **Every run starts with `reconcile`:**
   - `stale_claims`: claimed over 30 minutes ago. Search Sent for `to:<email> after:<claimed_at>`, compare `sha256(body)[:16]` with `body_hash` (never match by subject: follow-ups in one thread share it). Found: `sent`. Not found: `failed`, then `retry`.
   - `missing_next_steps`: a cold step was sent but the next one was never queued (crash between send and queue). Draft and queue it now.
