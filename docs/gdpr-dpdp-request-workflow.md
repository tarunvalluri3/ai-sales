# GDPR / DPDP data subject request workflow

Phase 22f, `STATE.md` / `docs/phases.md`. This is a **manual process**, not an in-app self-service flow — explicitly acceptable per the Phase 22 brief. It covers requests from two different kinds of people, who need different handling:

- **A customer** (a business using AI Sales) requesting their own account's data, or asking to close their account. They can already self-serve most of this — see "Self-service tools" below — but may still email instead of using the dashboard.
- **A visitor/prospect** who chatted with a customer's AI widget, asking what data AI Sales holds about them, or asking for it to be deleted. AI Sales is a data **processor** for this data (the customer is the controller), so these requests are routed to the customer, not resolved unilaterally — see "Visitor requests" below.

Every request in this document is a **request under GDPR (EU/UK) or India's DPDP Act** — access, export/portability, correction, deletion/erasure, or objection to processing.

## Who handles requests

Whoever holds `[support email]` (see `/privacy`, `/terms`) is responsible for triage. Until the team is larger than one person, that's the whole process — no ticketing system, no dedicated privacy team. If that changes, update this doc, don't let it silently drift out of date.

## Self-service tools (use these first)

Before doing anything manually, check whether the requester can just be pointed at what already exists:

- **Customer data export:** `/dashboard/profile` → "Export your data" (org:admin only) — downloads a full JSON export of everything the business owns (`lib/data-export.ts`, Phase 22e).
- **Customer account deletion:** `/dashboard/profile` → "Delete this business" (org:admin only, type-to-confirm) — cascades to every business-owned row (Phase 22e). Does **not** delete the Clerk organization/membership — see that section's own doc comment in `lib/business.ts` if a full identity teardown is separately requested.
- **Automatic conversation retention:** any visitor conversation with no activity in 24 months is already deleted automatically — see `docs/data-retention.md` (Phase 22d). A request for a very old, inactive conversation may already be moot; check before doing manual work.

## Customer requests (the business itself)

1. Verify the requester is actually a member of the business's Clerk organization (check the Clerk dashboard, or ask them to make the request from their own logged-in session where possible).
2. If they can self-serve (export/delete above), point them there.
3. If they need something the self-service tools don't cover (e.g., "delete only my personal data as an individual team member, not the whole business"), handle manually:
   - Query the relevant tables directly via the Supabase dashboard/CLI, scoped to `business_id`.
   - Record what was done — see "Record-keeping" below.
4. Respond within **30 days** (the GDPR default; DPDP's timelines are set by rules the business should also track if it has India-based customers) — sooner if reasonably possible.

## Visitor requests (a prospect who chatted with a widget)

AI Sales is the **processor**, the customer business is the **controller** — a visitor asking AI Sales directly should be redirected to the business they spoke with, not handled unilaterally by AI Sales staff, since AI Sales doesn't have the authority or context to decide what a customer's own prospect data should do. In practice:

1. Reply confirming AI Sales is the technology provider, not the business the visitor spoke to, and that the request needs to go to that business.
2. If the visitor doesn't know which business (rare, but possible if they don't recognize the brand), and they can provide enough identifying detail (approximate date, what the conversation was about, the site it was on), a team member may look up the conversation via the Supabase dashboard filtering on `messages.content` or `leads.contact_email`/`contact_phone` to identify the business, **then** redirect the visitor to that business.
3. If a customer business asks AI Sales to help fulfill a visitor's request on their behalf (e.g., "delete this one conversation"), that's a valid, explicit instruction from the controller — locate the conversation (`conversations.id`, findable via `leads.contact_email`/`contact_phone` or the dashboard's Conversations search) and delete it directly (cascades to its messages/lead row via existing FKs, same as the retention job's own cascade). Record it — see below.

## Record-keeping

For every request handled (customer or visitor, self-service or manual), log a line in the team's own internal record (a shared doc/spreadsheet is fine — this project has no dedicated request-tracking table) with: date, requester, business affected, what was requested, what was done, and who did it. This is separate from the in-app `audit_log` table (Phase 22b), which only covers specific in-app actions (conversation takeover, attention dismissal, knowledge deletion) — a manual deletion done directly via Supabase does not appear there, so this external record is the only trail for it.

## What this workflow does not (yet) do

- No automated intake form or ticketing — a request just arrives by email.
- No SLA tracking/reminders — the 30-day clock is tracked manually.
- No verification-of-identity tooling beyond "check Clerk membership" — for a visitor request, there's no strong identity verification at all (matching how little identifying info a chat widget visitor gives in the first place).

If request volume grows enough that this becomes a real burden, that's a concrete signal to build real tooling — not something to solve speculatively now.
