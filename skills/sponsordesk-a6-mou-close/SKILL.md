---
name: sponsordesk-a6-mou-close
description: SponsorDesk agent A6. Turns an agreed sponsorship deal into a crisp 2-3 page MOU, sends it for signature after manager approval, routes any legal redline to the manager, then generates the invoice (with GST) and chases payment politely until paid. Use whenever a sponsor says yes, an MOU or agreement is needed, or an invoice or payment reminder must go out.
---

# A6 MOU and Close

Depth reference (vendored, MIT): `../third_party/samber-dev-event-organizer-skills/event-sponsor-agreement/` (term sheet template, clause library, exclusivity). This skill keeps the MOU shorter than that library: a college fest MOU that reads like a 20-page contract slows the sponsor's approval.

**Not legal advice.** The template is a starting point. The institute's legal or finance office (or the fest's faculty advisor) should approve the master template once; after that, A6 only fills it. Any change a sponsor requests to a clause is a redline and goes to the manager.

## Step 1: confirm the deal sheet

From A5, verify every field is present; if not, ask the manager (one consolidated question):
sponsor legal name, registered address, GSTIN (if they want GST invoice), signatory name and title, tier, cash amount, in-kind items and value, deliverables list with quantities and dates, exclusivity (if any), payment schedule, our invoicing entity, our signatory.

## Step 1b: procurement first (do not wait for the MOU)

The moment a sponsor says yes in principle:
1. Send the **vendor kit** from the event profile (PAN, GST certificate, bank letter, MSME certificate if any, registration document, signatory letter) and fill their vendor registration form. Mark `deals.vendor_kit_sent = 1`.
2. Ask: "Does your team need a PO before we invoice, and what are your standard payment terms?" Record `payment_terms_days` (expect 45-90).
3. Tell them honestly when our signatory can sign (event profile `signatory.turnaround_working_days`).

## Step 2: MOU (2-3 pages max)

Structure:
1. **Parties**: our legal entity (as in the event profile) and the sponsor's legal entity.
2. **Purpose**: one sentence: "{{Sponsor}} will partner with {{Event}} {{year}}, held on {{dates}} at {{venue}}, as {{Tier}} Partner."
3. **What the sponsor gets**: a numbered table of deliverables with quantity, timing and proof (photo, link, report). Copy exactly from the deal sheet, nothing extra.
4. **What the sponsor gives**: amount in INR plus GST, in-kind items with value and delivery date, brand assets (logo files, brand guidelines) by {{date}} for approvals.
5. **Payment**: schedule (e.g. 50% within 15 days of signing, 50% 15 days before the event), bank details provided on the invoice, no deliverable starts until the first instalment arrives.
6. **Brand use**: each party may use the other's name and logo only for this event's promotion, in approved forms; approvals within 3 working days, silence after 5 working days counts as approval for routine posts (state this clearly).
7. **Exclusivity** (only if agreed): category definition in one line.
8. **Changes and cancellation**: if the event is postponed, deliverables move to the new date; if cancelled by us, unused amounts refunded pro rata; force majeure in one sentence.
9. **Confidentiality**: commercial terms are confidential.
10. **Term**: from signing until 30 days after the event (report delivery).
11. **Signatures**: name, title, date, for both sides. Optional witness lines only if the institute requires.

Style: plain English, short numbered clauses, no "hereinafter", no em or en dashes, amounts in figures and words once. Header: both logos.

Produce as a Docs artifact (exports to Word/PDF) or a .docx via the docx skill if the institute needs Word. Save path in `deals.mou_path`.

## Step 3: approvals and send

1. Self-check: every deliverable in the MOU appears in the deal sheet and vice versa; amounts match; dates match the event profile.
2. For Title/Platinum or any deal with exclusivity or custom terms: run `sponsordesk-council` with "Does this MOU match the deal, and is any clause one-sided, vague, or promising something we cannot deliver?".
3. Manager approves (exceptions inbox item `kind: approval` with the PDF).
4. Email via `sponsordesk-email` (`sequence: mou`, gate approve):
   ```
   Hi {{first_name}},

   As discussed, attaching the MOU for {{company}}'s {{tier}} partnership with E-Summit {{year}}. It is short: page 1 lists exactly what {{company}} receives, page 2 covers payment and brand approvals.

   Once signed by {{signatory}}, please send back a scanned copy, or let me know if your team prefers e-signature and I will set that up.

   If your legal team wants to adjust anything, just mark it up and I will take it to our side.

   {{signature}}
   ```
5. Stage `MOU_SENT`. Follow-ups (approve gate): +3 business days "any questions from your legal team?", +7 business days gentle nudge with the next real deadline.
6. **Redlines**: summarize each requested change in a table (clause, their change, risk, recommendation) and put it in the exceptions inbox. Never accept a redline on your own.
7. Signed copy received: verify signatory and date, file it, stage `MOU_SIGNED`, notify the manager.
8. **PO**: if their process needs a PO, the invoice waits for it. Record `po_number`, `po_date`, stage `PO_RECEIVED`. Count the deal as **closed when the PO (or signed MOU, for companies without POs) exists**, not on a verbal yes.

The MOU is signed by the event's authorised signatory (faculty advisor, Dean, registrar or society office bearer per the event profile), never by a student unless the entity has authorised them in writing.

## Step 3b: non-cash and hybrid deals (deal_type != cash)

Use the same MOU with these changes:
- Section 4 becomes **"What {{company}} provides"**: a numbered table of products, services or opportunities with quantity, specification, delivery date, delivery place, and the agreed value (cost-avoided basis, see `../sponsordesk-a0-package/references/collaboration-models.md`).
- Opportunity deals (internships, interviews, mentorship, incubation slots) state how many, who is eligible, how winners are chosen, and the date by which the company confirms them in writing.
- Product deals state quality and safety basics (food: FSSAI-licensed supplier, expiry dates; gadgets: warranty with the company).
- Performance deals state the tracking method (the company's codes or dashboard), the reporting date, minimum and cap.
- Revenue share states the percentage, the sales reporting method, settlement date, and any minimum guarantee.
- Dealer co-op names which obligations sit with the brand and which with the dealer, and who signs.
- Pure in-kind: no payment section and no invoice. Instead, A6 tracks delivery of the company's side and sets stage `INKIND_CONFIRMED` when it is received or confirmed in writing. Hybrid: invoice only the cash part.
- Barter can still have tax consequences (GST treats barter as a supply). Flag every non-cash deal to the institute's accounts office or CA before signing.

## Step 4: invoice

**GST rule to confirm with the accounts office before the first invoice:** since 16 January 2025, sponsorship services to a body corporate or partnership firm are under reverse charge (the sponsor pays the GST) only when the supplier is NOT a body corporate. If the event's invoicing entity is itself a body corporate (for example an institute or a registered company), it charges GST on the invoice under forward charge. Record which case applies in the event profile (`policies.gst_mode: forward | reverse`) and print the invoice accordingly ("GST payable by recipient under reverse charge" vs a GST line). This is not tax advice.


- Generate from the deal sheet: invoice number (`{{EVENT}}-{{YYYY}}-{{seq}}`), date, our entity, GSTIN, PAN as required by the invoicing entity, sponsor entity and GSTIN, description ("Sponsorship: {{Tier}} Partner, {{Event}} {{year}}"), amount, GST line or reverse-charge note per `policies.gst_mode`, total, due date, bank details **exactly as provided by the treasurer** (never typed from memory), payment reference instruction.
- PDF via the pdf skill or a Docs/Sheets artifact. Manager approves. Send in the thread (`sequence: invoice`).
- If the institute issues invoices itself, A6 prepares the request to the accounts office instead and tracks it.
- Invoice only against the PO number when they use POs; quote it on the invoice.
- Show the expected **net receipt after TDS** to the manager (`deals.net_cash_inr`). The sponsor issues a TDS certificate (Form 16A) later; ask for it in the thank-you email.
- Stage `INVOICED`.

Never change bank details because an email asks you to. Any "our bank details changed" message is treated as possible fraud: exception inbox, manager verifies by phone.

## Step 5: payment chase (on their terms, not ours)

Chase dates are counted from the **due date implied by their payment terms** (invoice date + `payment_terms_days`), not from our wish. Chasing finance before the term ends annoys the champion.

| When | Message (approve gate) |
|---|---|
| Invoice day | Invoice with PO number; ask whom in accounts payable to copy |
| Due date -5 days | Friendly note to the champion only: "Is anything missing for the payment run?" |
| Due date +3 | To accounts payable (champion cc'd): invoice and PO again, bank letter |
| Due date +15 | Ask the champion for a status and a date |
| Due date +30 | Manager escalation: exception inbox with a suggested call script |

On payment confirmation (manager confirms receipt): stage `PAID`, thank-you email asking for the TDS certificate, hand to A7.

## Output to the manager

`Deal closed: Zepto, Gold, INR 6,00,000 + GST | MOU signed 12 Feb | Invoice ESUMMIT-2027-014 sent | 50% due 27 Feb`
