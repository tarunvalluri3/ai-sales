-- Phase 25b "top unanswered questions": one row per ungrounded/fallback
-- AI turn (lib/rag.ts's askSalesEmployee(), grounded: false), logging
-- the prospect's own question text so the dashboard can aggregate the
-- most common gaps in a business's knowledge base. Same
-- service-role-write / authenticated-read-only pattern as
-- ai_response_metrics (20260820134000) -- written exclusively from
-- app/api/chat/route.ts's service-role client, never from a dashboard
-- caller.
--
-- `question` is real prospect message content, unlike every other
-- analytics-source table in this project (which store only counts/
-- durations/enum-strings) -- deliberate, since "top unanswered
-- questions" is meaningless without the text. Covered by the same
-- 24-month conversation-retention cascade as everything else
-- conversation-scoped (on delete cascade via conversation_id).

create table public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  question text not null,
  created_at timestamptz not null default now()
);

create index unanswered_questions_business_id_idx on public.unanswered_questions (business_id);
create index unanswered_questions_created_at_idx on public.unanswered_questions (created_at);

alter table public.unanswered_questions enable row level security;
alter table public.unanswered_questions force row level security;

grant select on public.unanswered_questions to authenticated;

create policy "unanswered_questions_select_own_business" on public.unanswered_questions
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
