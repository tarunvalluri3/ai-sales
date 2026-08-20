-- Phase 25b "funnel analytics": two small columns backing new metrics.
--
-- messages.grounded: persists askSalesEmployee()'s already-computed
-- `grounded` boolean (lib/rag.ts, previously discarded after the
-- response was sent) on every assistant-role row -- backs the
-- "answer-failure rate" metric without fragile string-matching against
-- FALLBACK_MESSAGE's exact text. Null for user/human_agent rows, where
-- the concept doesn't apply.
--
-- conversations.source_url: the host page's URL (origin + pathname only
-- -- the widget loader deliberately strips query strings before sending,
-- since they can carry tracking tokens/PII this app has no reason to
-- store) at the moment a conversation was created -- backs "source/page
-- attribution". Null for conversations created before this column
-- existed, and for any future non-widget conversation source.
alter table public.messages
  add column grounded boolean;

alter table public.conversations
  add column source_url text;

alter table public.conversations
  add constraint conversations_source_url_length check (source_url is null or char_length(source_url) <= 500);
