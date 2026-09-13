-- Phase 29 support tables for two of the workflow engine's real actions
-- ("create internal sales task", "send internal notification"), and for
-- a business's own manual task list (sales_tasks is not workflow-only --
-- a staff member can also create/complete a task directly, the same
-- table serving both, rather than a second parallel "manual tasks"
-- concept).
--
-- Both carry `workflow_run_id`/`step_index` with a **unique constraint**
-- on that pair -- this is the concrete idempotency mechanism the task
-- explicitly requires ("an action must never execute twice simply
-- because a cron attempt is repeated"): a workflow-created row's second
-- attempt at the same step hits the unique violation and is treated as
-- "already done," not an error. Manually-created rows (both columns
-- null) are unaffected -- Postgres treats null-null as distinct for a
-- unique index, so many manual tasks can coexist.

create table public.sales_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  assigned_to_user_id text,
  customer_id uuid references public.customers (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  workflow_run_id uuid references public.workflow_runs (id) on delete set null,
  step_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_tasks_title_length check (char_length(title) between 1 and 200),
  unique (workflow_run_id, step_index)
);

create index sales_tasks_business_id_idx on public.sales_tasks (business_id);
create index sales_tasks_business_id_status_idx on public.sales_tasks (business_id, status);
create index sales_tasks_customer_id_idx on public.sales_tasks (customer_id);

create trigger sales_tasks_set_updated_at
  before update on public.sales_tasks
  for each row
  execute function public.set_updated_at();

alter table public.sales_tasks enable row level security;
alter table public.sales_tasks force row level security;

grant select, insert, update, delete on public.sales_tasks to authenticated;

create policy "sales_tasks_select_own_business" on public.sales_tasks
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "sales_tasks_insert_own_business" on public.sales_tasks
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "sales_tasks_update_own_business" on public.sales_tasks
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "sales_tasks_delete_own_business" on public.sales_tasks
  for delete to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create table public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  target_user_id text,
  message text not null,
  link text,
  workflow_run_id uuid references public.workflow_runs (id) on delete set null,
  step_index integer,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint internal_notifications_message_length check (char_length(message) between 1 and 500),
  unique (workflow_run_id, step_index)
);

create index internal_notifications_business_id_idx on public.internal_notifications (business_id, created_at desc);
create index internal_notifications_unread_idx on public.internal_notifications (business_id) where read_at is null;

alter table public.internal_notifications enable row level security;
alter table public.internal_notifications force row level security;

-- No delete grant -- a notification is marked read, never removed,
-- keeping a real (if small) audit trail of what fired.
grant select, insert, update (read_at) on public.internal_notifications to authenticated;

create policy "internal_notifications_select_own_business" on public.internal_notifications
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "internal_notifications_insert_own_business" on public.internal_notifications
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "internal_notifications_update_own_business" on public.internal_notifications
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));
