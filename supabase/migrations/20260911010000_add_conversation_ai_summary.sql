-- Conversations inbox redesign (2026-09-11): an on-demand, cached AI
-- summary of what the prospect is asking about/looking for. Deliberately
-- NOT auto-generated on the dashboard's 1-second poll -- a plain
-- single-shot Gemini call (lib/conversation-summary.ts), never
-- askSalesEmployee()'s RAG/tool-calling pipeline, triggered only by an
-- explicit staff click, so AI spend never scales with idle polling time.
--
-- ai_summary_message_count records how many messages the summary was
-- generated from, so the UI can say "N new messages since last summary"
-- and offer a refresh instead of silently going stale -- same
-- AI-output-is-untrusted labeling discipline as leads.qualification_reason
-- (docs/security.md §8): display-only, never a gate for anything.
alter table public.conversations
  add column ai_summary text,
  add column ai_summary_generated_at timestamptz,
  add column ai_summary_message_count integer;

-- Same mechanism as every other conversations column added post-Phase-15a
-- (control, needs_attention): the existing conversations_update_own_business
-- RLS policy already scopes any UPDATE to the caller's own business; this
-- only widens which columns `authenticated` may touch.
grant update (ai_summary, ai_summary_generated_at, ai_summary_message_count)
  on public.conversations to authenticated;
