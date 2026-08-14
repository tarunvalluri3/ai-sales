-- Phase 14c (request_callback tool): adds requested_callback to leads,
-- set true when the AI tool creates/updates a lead after the prospect has
-- agreed to a callback and given contact info (prompts/phase-14c-request-callback-tool.md).
--
-- No new grant needed: the existing table-level
-- `grant select, insert, update, delete on public.leads to authenticated`
-- (Phase 10) has no column list, so it already covers this new column --
-- confirmed by inspection before writing this migration, verified live
-- post-push via has_column_privilege(). service_role (the widget's actual
-- write path) bypasses RLS/grants entirely, unaffected either way.
--
-- The unique(conversation_id) constraint closes a real gap:
-- getLeadForConversation() already assumes at most one lead per
-- conversation (.maybeSingle()), but nothing enforced it. A live
-- pre-flight duplicate check (select conversation_id, count(*) from leads
-- group by conversation_id having count(*) > 1) found zero existing
-- duplicates across 6 rows before this migration was written -- safe to
-- add.

alter table public.leads
  add column requested_callback boolean not null default false;

alter table public.leads
  add constraint leads_conversation_id_unique unique (conversation_id);
