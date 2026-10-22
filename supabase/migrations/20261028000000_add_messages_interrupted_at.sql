-- feat/chat-streaming: mark an assistant message whose streamed answer was
-- cut off before it finished -- a visitor who closed the tab or pressed
-- stop mid-stream, or a server-side generation deadline hit after some
-- text had already been shown. Such a turn must never be recorded as a
-- successful complete reply (design §d): the partial text that the
-- prospect actually saw is persisted so a refresh restores a consistent
-- transcript, but it carries this timestamp so the dashboard, analytics,
-- and any later reader can tell a half-answer from a real one. No
-- ai_response_metrics success row is written for an interrupted turn
-- either (see lib/rag.ts streamSalesEmployee), the same posture the
-- response-timeout path already has.
--
-- Purely additive: one nullable column, no backfill (NULL is the truthful
-- value for every message written before this existed and for every
-- normal, complete reply), no constraint change, no RLS or grant change
-- (the column inherits public.messages' existing row-level security and
-- the service-role-only write path). Safe to apply to a live table.
--
-- Rollback: alter table public.messages drop column interrupted_at;

alter table public.messages
  add column interrupted_at timestamptz;

comment on column public.messages.interrupted_at is
  'When set, this assistant message was streamed to the visitor but cut off before completion (disconnect, visitor abort, or a mid-stream generation timeout). A non-null value means the turn is NOT a successful complete reply. NULL for every complete reply and every message predating feat/chat-streaming.';
