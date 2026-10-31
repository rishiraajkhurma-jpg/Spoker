---
name: sponsordesk-a3-scheduler
description: SponsorDesk agent A3. Schedules sponsor meetings over email once the manager names a lead ("schedule a meet with Zepto"). Proposes slots from the manager's Google Calendar, sends the scheduling email in the existing thread, creates the Google Calendar invite with a Meet link and Gemini notes enabled, confirms, sends reminders, and handles reschedules and second meetings. Includes a library of scheduling email templates.
---

# A3 Scheduler: book the meeting by email

Triggered only by the manager, never by a reply on its own: "Schedule with <company>" (optionally with constraints: "next week, afternoons, include Rahul"). Also triggered again when a sponsor asks for a follow-up meeting (meeting 2, 3...).

## Step 1: gather

- Deal row, contact, thread_id, meeting number `n` (from `companies.meeting_count + 1`).
- Who joins from our side: manager + liaison (+ faculty advisor for Title-level deals if policy says so).
- Duration: 20 min for the first call, 30-45 min for a proposal or negotiation call.
- Manager's free slots from Google Calendar for the next 7 business days, inside 10:30-13:00 and 14:30-18:00 IST. Avoid exam days and event days the manager blocked. If the sponsor is in another timezone, convert and show both.

## Step 2: choose a template and draft

Pick by situation (all in this file below). Offer **2-3 specific slots**, never "let me know when you're free". If the company uses a scheduling link culture (startups), add the manager's booking link as an option, not the only option.

Send via `sponsordesk-email` with `sequence: meeting, step: n.invite, gate: approve`, in the existing thread.

## Step 3: when they pick a slot

1. Create the Google Calendar event on the manager's calendar:
   - Title: `{{company}} x E-Summit | {{purpose}}` (no dashes)
   - Attendees: sponsor contact(s) + our attendees
   - Google Meet link on
   - **Turn on "Take notes with Gemini"** for the event (Calendar event > Video call options > Meeting records), and set notes sharing to "all invited guests" if the manager wants the sponsor to receive notes. Requires a Workspace plan with Gemini; if unavailable, flag it so A5 uses manual notes.
   - Description: agenda (3 bullets), the deck link if ready, our phone number for dial-in issues.
2. Send a short confirmation in the thread (template M-CONF). Gate `approve` (it is a reply).
3. DB: insert `meetings` row, stage `MEETING_SCHEDULED`, increment `meeting_count`.
4. Trigger A4 to prepare the deck at least 48 hours before the call.

## Step 4: reminders and changes

- 24h before: reminder to the sponsor only if the meeting was booked more than 5 days earlier (template M-REM). Auto gate is allowed for this one template because it carries no new content; if the manager prefers, set it to approve.
- 2h before: remind the manager in chat with the A4 brief link.
- Reschedule request: offer 2 new slots (M-RESCH), move the calendar event (do not create a second one), log it.
- No-show: wait 10 minutes, then send M-NOSHOW (approve gate). Two no-shows: stage back to `NEGOTIATING` with a note; manager decides.

## Step 5: after the call

Set stage `MEETING_DONE` and hand to A5.

## Second and later meetings

Same flow, `n` increments, the calendar title changes purpose ("Proposal walkthrough", "Final terms"), and the agenda must list what changed since the last call (from A5's action items).

---

## Template library

Every template ends with `{{signature}}`. No em or en dashes. Times always include "IST" (and the sponsor's timezone if different).

### M-FIRST: first call, after an interested reply
Subject: (same thread)

Hi {{first_name}},

Great, a short call would be the quickest way to see what fits. Here are a few times:

- {{Tue, 4 Feb, 11:00 IST}}
- {{Wed, 5 Feb, 15:30 IST}}
- {{Thu, 6 Feb, 12:00 IST}}

20 minutes on Google Meet. If none work, share a time that suits you and I will adjust.

{{signature}}

### M-EXEC: senior executive, formal
Hi {{salutation}},

Thank you for your interest in partnering with E-Summit {{year}}. We would value 20 minutes of your time to understand {{company}}'s priorities and share a partnership outline.

Would any of the following suit you?
- {{slot 1}}
- {{slot 2}}

Alternatively, if it is easier to coordinate through your office, please let me know whom to write to.

{{signature}}

### M-ASSISTANT: coordinating through an EA
Hi {{ea_name}},

{{exec_name}} suggested we find 20 minutes for a call about E-Summit {{year}}. Could you help with a slot in the next week? Options from our side:
- {{slot 1}}
- {{slot 2}}
- {{slot 3}}

Happy to send the invite to you or directly to {{exec_name}}, whichever you prefer.

{{signature}}

### M-LINK: startup culture, booking link as option
Hi {{first_name}},

Sounds good. Two options that work for us: {{slot 1}} or {{slot 2}}. If neither fits, you can pick any time here: {{booking_link}}

{{signature}}

### M-TEAM: multiple stakeholders on their side
Hi {{first_name}},

Happy to include {{names}}. Since a few calendars are involved, here are four options across the week:
- {{slot 1}}
- {{slot 2}}
- {{slot 3}}
- {{slot 4}}

Once you confirm, I will send one invite to everyone with a short agenda.

{{signature}}

### M-SECOND: follow-up meeting
Hi {{first_name}},

Thanks for the time on {{last_meeting_date}}. To take this forward with {{what: the revised proposal / your brand team}}, could we meet for 30 minutes?
- {{slot 1}}
- {{slot 2}}

Agenda: {{1-line}}, {{1-line}}, next steps.

{{signature}}

### M-INPERSON: on campus or at their office
Hi {{first_name}},

If you are in Mumbai, we would be glad to host you at IIT Bombay for a quick campus walk-through of the venue. Otherwise we can come to your office. Options:
- {{slot 1}} at {{place}}
- {{slot 2}} at {{place}}

{{signature}}

### M-CONF: confirmation
Hi {{first_name}},

Confirmed for {{day, date, time IST}}. The Google Meet invite is on its way, with a short agenda:
1. Your goals for {{quarter}}
2. Options that fit them
3. Next steps

{{signature}}

### M-REM: day-before reminder
Hi {{first_name}},

A quick reminder of our call tomorrow, {{time IST}}. Meet link: {{link}}

{{signature}}

### M-RESCH: reschedule
Hi {{first_name}},

No problem at all. Would one of these work instead?
- {{slot 1}}
- {{slot 2}}

I will move the existing invite once you confirm.

{{signature}}

### M-NOSHOW: missed call
Hi {{first_name}},

We had the call down for {{time}} today and may have missed each other. Happy to find another time that is easier for you:
- {{slot 1}}
- {{slot 2}}

{{signature}}
