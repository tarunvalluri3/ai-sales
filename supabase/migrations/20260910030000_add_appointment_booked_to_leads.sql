-- Booking a real appointment is the strongest buying-intent signal a
-- prospect can give (lib/lead-scoring.ts), but until now book_appointment
-- never touched the leads table at all -- a prospect who booked a call
-- without also triggering request_callback produced no lead row.
-- lib/leads.ts's new upsertLeadForConversation() sets this column so the
-- dashboard leads list can show it and the scorer can weigh it, same
-- shape as the existing requested_callback column added in
-- 20260814070328_add_requested_callback_to_leads.sql.
--
-- No new grant needed: the existing table-level grant on leads already
-- covers this column.

alter table public.leads
  add column appointment_booked boolean not null default false;
