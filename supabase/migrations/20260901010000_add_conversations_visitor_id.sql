-- Phase 25d "recent chats": a client-generated, unauthenticated
-- correlation id (public/widget-loader.js, localStorage, NOT an
-- identity/authorization credential -- docs/security.md §4) that lets
-- the widget list a returning visitor's own past conversations for a
-- business without exposing every visitor's history via the shared
-- widget key alone. Null for conversations created before this column
-- existed and for any non-widget conversation source.
alter table public.conversations
  add column visitor_id text;

alter table public.conversations
  add constraint conversations_visitor_id_length check (visitor_id is null or char_length(visitor_id) <= 100);

create index conversations_business_visitor_idx
  on public.conversations (business_id, visitor_id, created_at desc)
  where visitor_id is not null;
