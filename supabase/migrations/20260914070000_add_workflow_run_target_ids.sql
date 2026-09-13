-- Phase 29 follow-up, same session: `workflow_runs.target_type`/`target_id`
-- alone aren't enough for a *delayed* run to resume correctly later (a
-- cron pass hours or days after the triggering event, with no calling
-- context left) -- an action like `add_tag`/`flag_attention` needs a real
-- `lead_id`/`conversation_id` to act on, not just "this run's target was
-- a lead." Storing both ids directly on the run, resolved once at
-- creation time from whichever entity actually triggered it, makes every
-- run fully self-contained -- lib/workflow-engine.ts's `advanceWorkflowRun()`
-- never needs to re-derive them.

alter table public.workflow_runs
  add column lead_id uuid references public.leads (id) on delete set null,
  add column conversation_id uuid references public.conversations (id) on delete set null;

create index workflow_runs_lead_id_idx on public.workflow_runs (lead_id);
create index workflow_runs_conversation_id_idx on public.workflow_runs (conversation_id);
