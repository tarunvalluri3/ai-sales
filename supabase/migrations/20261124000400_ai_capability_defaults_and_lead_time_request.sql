-- AI honesty fix (2026-11-20).
--
-- 1. New businesses get appointment booking and product recommendations ON by
--    default. Both are core selling points, and a live test showed a new
--    clinic's agent improvising a booking it could not make because booking
--    was silently off. Column defaults only: EXISTING businesses keep exactly
--    what they have (owner's decision). build_agent_snapshot() reads these
--    columns at publish, so a new business's first published version carries
--    them. The runtime still binds the booking tools only when the business
--    also has open hours (lib/appointments.ts loadBookingTurnState); without
--    hours the agent offers a callback instead.
--
-- 2. Two staff-only lead fields from request_callback, so a prospect who asks
--    for a specific time scores like a booking (lib/lead-scoring.ts) and keeps
--    that score on later updates:
--      preferred_time  -- the day/time the prospect asked for, in their words
--      interest_note   -- the product/service they asked about, in their words
--    Both are prospect-derived (via the model), so untrusted: Zod-validated,
--    trimmed and capped in lib/tools/request-callback.ts, capped again here,
--    shown to staff only and never used to create an appointment. Written by
--    the same server paths as the rest of the lead row; the existing
--    table-level grants and RLS on public.leads already cover them.

alter table public.businesses
  alter column appointments_enabled set default true,
  alter column recommend_products_enabled set default true;

alter table public.leads
  add column preferred_time text check (preferred_time is null or char_length(preferred_time) <= 100),
  add column interest_note text check (interest_note is null or char_length(interest_note) <= 100);
