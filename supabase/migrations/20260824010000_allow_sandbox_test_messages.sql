-- Phase 25c "test your AI before publishing" sandbox workspace: the first
-- ever authenticated (Clerk-session) caller of askSalesEmployee() --
-- previously called only from the service-role widget path
-- (app/api/chat/route.ts). lib/retrieval.ts's match_knowledge_chunks RPC
-- already grants execute to authenticated for exactly this reason (see
-- its own doc comment), but messages.insert only ever granted the
-- 'human_agent' role (20260814084209) -- a sandbox turn needs to insert
-- 'user' and 'assistant' rows too.
--
-- Narrowly scoped to conversations.source = 'dashboard_test' (set by the
-- new sandbox-chat action, never client input) so this can never be used
-- to forge a 'user'/'assistant' message on a real prospect conversation.
-- Widened column grant: sandbox 'assistant' rows also carry
-- source_chunk_ids/grounded (askSalesEmployee's normal output), not just
-- the four columns the human_agent-reply grant needed.
grant insert (business_id, conversation_id, role, content, source_chunk_ids, grounded)
  on public.messages to authenticated;

create policy "messages_insert_sandbox_test" on public.messages
  for insert
  to authenticated
  with check (
    role in ('user', 'assistant')
    and business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.business_id = messages.business_id
        and c.source = 'dashboard_test'
    )
  );
