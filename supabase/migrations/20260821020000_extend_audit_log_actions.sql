-- Extends audit_log's closed action enum (Phase 22) for Phase 24's new
-- admin-level actions: widget key lifecycle, knowledge publish/unpublish,
-- outbound webhook endpoint lifecycle, and business-hours changes. Same
-- closed-list, no-free-text convention as the original three actions --
-- an unrecognized action string is a bug, not a legitimate audit entry.

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'conversation.control_changed',
    'conversation.attention_dismissed',
    'knowledge.deleted',
    'knowledge.published',
    'knowledge.unpublished',
    'widget_key.created',
    'widget_key.origins_updated',
    'widget_key.revoked',
    'webhook_endpoint.created',
    'webhook_endpoint.deleted',
    'business_hours.updated'
  )
);
