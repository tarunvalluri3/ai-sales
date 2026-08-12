# Default privileges: revoke EXECUTE on functions from PUBLIC

## Goal

After this is implemented, every Postgres function created in this project from this migration forward starts with zero default `EXECUTE` access to `PUBLIC` (and therefore to `anon` and any other role that hasn't been explicitly granted it) — the function-level equivalent of Phase 3's `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON TABLES FROM anon, authenticated`. Today, only `match_knowledge_chunks` has been individually fixed (`prompts/fix-match-knowledge-chunks-public-execute-grant.md`); the underlying Postgres default that caused that gap — `EXECUTE` on new functions granted to `PUBLIC` automatically — is still in effect, so the next function this project creates will silently reopen the same class of gap unless its migration remembers to revoke it by hand, every time.

## Current phase

Not tied to a specific product phase — a database-hygiene fix, applied before Phase 8 (LangChain RAG) at the user's explicit direction, since Phase 8 will likely add new Postgres functions (a retriever function, a chat-logging RPC, etc.) that would otherwise inherit this same default-open issue.

## User request

"Then: yes, do the schema-wide 'ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC' fix now, before Phase 8. Cheaper to close this class of gap once than patch it per-function again, and Phase 8 (LangChain RAG) may well introduce new database functions [...] that would otherwise inherit the same default-open issue. Write that as its own small prompt, following the same pattern as the `match_knowledge_chunks` fix."

## Skills and docs read

- `STATE.md` §8 — the "known limitations" entry that already flagged this exact fix as an open near-term follow-up, added when `match_knowledge_chunks`'s individual grant was fixed.
- `docs/architecture.md`'s "Database" section — both the existing table-level default-privileges history (Phase 3) and the newer "Functions default to PUBLIC execute access" note this fix directly resolves the open half of.
- `AGENTS.md` §5 — this is a security/access-control change (grants), so it gets its own prompt, same reasoning as the `match_knowledge_chunks` fix, not the trivial-change exemption.
- `docs/security.md` §3 (grant discipline), §11 review checklist.

## Existing code inspected

- `supabase/migrations/20260811150450_default_privileges_least_privilege.sql` — the exact precedent this migration mirrors: `alter default privileges in schema public revoke all on tables from anon, authenticated;`, explicitly **not retroactive**, `service_role` untouched.
- `supabase/migrations/20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql` — the per-function fix this schema-wide migration is meant to make unnecessary for every function after this point (it remains in place; this migration doesn't replace or supersede it, since it's not retroactive).
- Confirmed via `supabase/migrations/*.sql`: `match_knowledge_chunks` is the only function this project has defined so far (aside from `set_updated_at()`, the shared `updated_at` trigger function from Phase 3 — a trigger function invoked internally by Postgres on row updates, never called directly by a client role, so it was never exposed by the `PUBLIC` execute default the same way a client-callable RPC like `match_knowledge_chunks` was).

## Relevant existing architecture

Phase 3 already established the pattern this migration follows exactly: a table-level `ALTER DEFAULT PRIVILEGES` fix, explicitly scoped and explicitly non-retroactive, verified afterward with a throwaway/real object. This migration is the same fix, one level type over (functions instead of tables), prompted by the exact same root cause (Postgres's own default privileges) manifesting in a new place.

## Decisions and assumptions

1. **Not retroactive**, matching the Phase 3 precedent exactly — `match_knowledge_chunks`'s grants are already fixed by its own dedicated migration, so there is nothing for this migration to reconcile there. This migration only changes what happens for functions created *after* it runs.
2. **Revoke from `PUBLIC` only, not `anon`/`authenticated` individually.** Unlike the Phase 3 table fix (which revoked from `anon, authenticated` because a database-level `ALTER DEFAULT PRIVILEGES` from provisioning had granted broad table privileges directly to those named roles), this project's function-grant problem is Postgres's own built-in default: `EXECUTE` on new functions is granted to `PUBLIC` by the SQL standard, and every role — including `authenticated` — inherits from `PUBLIC`. Revoking from `PUBLIC` at the default-privilege level closes that inherited path for every role at once; each function's own migration remains responsible for explicitly granting `EXECUTE` to `authenticated` (or whichever role actually needs it), exactly as `match_knowledge_chunks`'s original migration already did and as every future function must continue to do.
3. **`service_role` untouched** — same as every other grant-hardening migration in this project; it's expected to bypass RLS and hold broad privileges by design.
4. **Scoped to the `public` schema only**, matching the Phase 3 precedent — this project has no functions outside `public` and no reason to touch `extensions` or any other schema's function defaults.

## Open decisions this depends on

None.

## Dependencies / packages required

None.

## Files likely to change

**Created:**
- `supabase/migrations/<ts>_default_privileges_revoke_execute_on_functions.sql`

**Modified:**
- `docs/architecture.md` — update the "Functions default to PUBLIC execute access" note (added by the `match_knowledge_chunks` fix) to record that the schema-wide default is now closed, and that new functions still need an explicit `grant execute ... to authenticated` in their own migration (the default no longer opens it, but nothing auto-closes the need to open it deliberately).
- `STATE.md` — final step, per `AGENTS.md` §0.6; also resolves the open item added to §8 by the `match_knowledge_chunks` fix.

## Database changes

```sql
-- Function-level equivalent of
-- 20260811150450_default_privileges_least_privilege.sql. Postgres grants
-- EXECUTE on every new function to PUBLIC by default (the SQL-standard
-- default, not a project-specific provisioning artifact like the table
-- case was) -- every role, including authenticated, inherits from
-- PUBLIC, so this was the root cause of the match_knowledge_chunks gap
-- fixed in 20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql.
-- This closes it at the source for every function created from here on;
-- each function's own migration is still responsible for its own
-- explicit `grant execute ... to authenticated` (or whichever role
-- actually needs it), exactly as before -- this migration does not grant
-- anything, it only stops the automatic PUBLIC grant.
--
-- Not retroactive: does not affect match_knowledge_chunks (already fixed
-- individually) or any function created before this migration runs.
-- service_role is untouched (expected to bypass RLS / hold broad
-- privileges by design).

alter default privileges in schema public
revoke execute on functions from public;
```

**Exact migration commands:** `supabase migration new default_privileges_revoke_execute_on_functions`, hand-author the SQL above, then the user runs `supabase link` + `supabase db push`.

## Server / client boundaries

None — database-only change, no server/client code touched.

## Implementation requirements

1. Write the migration exactly as specified above.
2. Update `docs/architecture.md`'s existing "Functions default to PUBLIC execute access" note (see Files likely to change) to reflect that the schema-wide default is now closed, matching how the table-level section documents its own Phase 3 default-privileges fix as the closing chapter of that gap.

## Security requirements

- `docs/security.md` §11 review checklist: closes the "next function silently reopens the same gap" risk at the source, rather than relying on remembering to add a per-function revoke every time (which is exactly how `match_knowledge_chunks` was missed the first time).
- No new secret, no new env var, no client-facing change. `service_role` unaffected.

## Error handling

Not applicable — `ALTER DEFAULT PRIVILEGES` changes future behavior only; it cannot fail against existing objects since it doesn't touch them.

## Acceptance criteria

- [ ] Migration applies cleanly.
- [ ] A newly created test function (throwaway, verified then dropped — same verification pattern Phase 3 used for the table-level fix) has no `EXECUTE` grant to `PUBLIC` or `anon` by default, and requires an explicit `grant` to be callable by `authenticated`.
- [ ] `match_knowledge_chunks`'s existing grants (from its own dedicated fix) are unaffected — confirmed via `information_schema.role_routine_grants`, same query as the prior fix's verification.
- [ ] `docs/architecture.md` updated to record the schema-wide default is now closed.

## Automated checks

- `npm run lint` / `npx tsc --noEmit` / `npm run build` — no impact expected (no application code changes), run anyway per `AGENTS.md` §7 and report the real result.
- `supabase test db` — no new pgTAP test; this is a default-privileges change, verified the same way Phase 3's table-level equivalent was (a throwaway object plus a real query), not via pgTAP.

## Manual testing steps

1. Apply the new migration.
2. Create a throwaway test function (e.g. `create function public._test_default_privileges() returns int language sql as $$ select 1; $$;`), then run:
   ```sql
   select grantee, privilege_type
   from information_schema.role_routine_grants
   where routine_name = '_test_default_privileges';
   ```
   Confirm no row for `PUBLIC` or `anon` — the default no longer auto-grants execute. Then `drop function public._test_default_privileges();` (not a permanent schema object, same throwaway-then-drop pattern Phase 3 used).
3. Re-run the grant query for `match_knowledge_chunks` (`where routine_name = 'match_knowledge_chunks'`) and confirm it's unchanged from the prior fix's verification — still `authenticated` / `EXECUTE` only, nothing else.

## Out of scope

- Any change to `match_knowledge_chunks` itself — already fixed, not retroactively touched by this migration.
- Any function outside the `public` schema.
- Any change to `service_role`'s privileges.
