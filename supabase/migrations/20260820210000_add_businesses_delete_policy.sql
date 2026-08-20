-- Tenant self-service delete (Phase 22e, STATE.md / docs/phases.md).
-- Deleting a business's own row cascades to every business-owned table
-- across the schema (products/services/faqs/knowledge_documents/
-- knowledge_chunks/conversations/messages/leads/audit_log/
-- ai_response_metrics all reference businesses(id) on delete cascade) --
-- one delete, no residual row anywhere, matching this project's existing
-- cascade-delete precedent (20260820200000's retention job).
--
-- Mirrors businesses_insert_own_org's own reasoning
-- (20260811151559_add_businesses_insert_policy.sql): this policy only
-- checks org match, not role -- "must be an org admin" is enforced at
-- the application layer via requireAuthContext({ role: "org:admin" }),
-- not a hand-parsed JWT role claim, same as every other admin-gated
-- action in this codebase.

grant delete on public.businesses to authenticated;

create policy "businesses_delete_own_org" on public.businesses
  for delete
  to authenticated
  using (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  );
