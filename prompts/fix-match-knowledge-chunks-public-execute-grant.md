# Fix: revoke PUBLIC/anon execute access on match_knowledge_chunks

## Goal

After this is implemented, `public.match_knowledge_chunks` is callable only by `authenticated` sessions, matching what its Phase 7 migration intended. Today it is also callable by `anon` and by `PUBLIC` (including completely unauthenticated database connections), because Postgres grants `EXECUTE` on new functions to `PUBLIC` by default and the original migration never revoked it — an oversight in `20260812161850_create_match_knowledge_chunks_function.sql`, which only added a `grant ... to authenticated` and assumed that was the only access path, the same class of mistake this project already hit once with table grants in Phase 3.

## Current phase

Phase 7 — Embeddings + pgvector (implemented, not yet closed — `STATE.md` §1). This is a fix to a migration from that phase, following the same pattern as the Phase 6 index-bugfix migration: a new migration, not a hand-edit of the original.

## User request

"Found a real gap: `match_knowledge_chunks` currently has EXECUTE granted to `anon` and `PUBLIC`, not just `authenticated` as the approved migration specified. [...] Write a small follow-up migration: revoke execute ... from public; revoke execute ... from anon; Confirm `authenticated`'s existing EXECUTE grant is untouched. This touches security, needs its own prompt per `AGENTS.md`, not the trivial-change exemption. Also add a note to `docs/architecture.md`'s Database section [...]."

## Skills and docs read

- `STATE.md` §1 — confirms Phase 7 status and the exact function this fix targets.
- `AGENTS.md` §5 — confirms this doesn't qualify for the trivial-change exemption ("no auth, tenancy, or secret handling touched" is violated — this is exactly auth/access-control handling), and that a prompt is required, per the user's own correct call.
- `docs/security.md` §3 (RLS/grant discipline), §11 review checklist ("every new tool authorizes before executing" — the same principle applies to a retrieval function reachable by an unauthenticated connection).
- `docs/architecture.md`'s "Database" section — the existing "verify actual grants after any migration that creates a table" note this fix's documentation addition extends to functions.

## Existing code inspected

- `supabase/migrations/20260812161850_create_match_knowledge_chunks_function.sql` — confirmed: creates `match_knowledge_chunks`, then only `grant execute ... to authenticated;`. No `revoke ... from public` anywhere in this file or any other migration. Confirmed this is the only migration that creates or grants on this function — there's nothing else to reconcile.
- `supabase/migrations/20260811145006_tighten_businesses_grants.sql` — the precedent for this exact class of fix (excess default privilege discovered post-migration, fixed with a dedicated follow-up migration, not a hand-edit).

## Relevant existing architecture

This project has already established, twice (Phase 3's table-grant fix, Phase 6's partial-index fix), that a migration bug gets fixed with a **new** migration, never a hand-edit of an already-applied one, and that `STATE.md`/`docs/architecture.md` record what happened and why so the same class of mistake is easier to catch next time. This fix follows that pattern exactly, extending it from tables (where this project already knows to check grants) to functions (where it didn't yet have a written rule).

## Decisions and assumptions

1. **Revoke from both `public` and `anon` explicitly**, per the user's exact instruction, even though revoking from `public` alone is normally sufficient in Postgres (role-level grants like `anon`'s, if any existed independently of the `PUBLIC` default, would need their own revoke; doing both leaves no ambiguity about which grant path is closed, and costs nothing — a `revoke` on a grant that doesn't exist is a no-op, not an error).
2. **No change to the function body, `security invoker`, or the `authenticated` grant.** This is purely an access-control fix; the function's logic and its own internal `business_id` filtering (defense-in-depth against RLS) are unaffected and already correct.
3. **This is a database-only change** — no application code (`lib/retrieval.ts`, `lib/embeddings.ts`) is affected, since `authenticated` access is unchanged and that's the only role the app ever calls through.

## Open decisions this depends on

None.

## Dependencies / packages required

None.

## Files likely to change

**Created:**
- `supabase/migrations/<ts>_revoke_public_execute_on_match_knowledge_chunks.sql`

**Modified:**
- `docs/architecture.md` — new note in the "Database" section: Postgres functions default to `PUBLIC` `EXECUTE` access unless explicitly revoked, unlike tables in this project (which default to zero grants since the Phase 3 `ALTER DEFAULT PRIVILEGES` migration) — this must be checked separately, per-function, whenever a new function is added.
- `STATE.md` — final step, per `AGENTS.md` §0.6.

## Database changes

```sql
-- Postgres grants EXECUTE on new functions to PUBLIC by default. The
-- original migration (20260812161850_create_match_knowledge_chunks_function.sql)
-- granted execute to authenticated but never revoked the PUBLIC default,
-- so this function was callable by anon and by completely unauthenticated
-- connections -- the same class of gap Phase 3 hit with table grants
-- (20260811145006_tighten_businesses_grants.sql), now known to apply to
-- functions too (see docs/architecture.md's Database section).

revoke execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) from public;
revoke execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) from anon;

-- authenticated's execute grant (from the original migration) is
-- untouched by the above -- explicit per-role grants are independent of
-- the PUBLIC default and of each other.
```

**Exact migration commands:** `supabase migration new revoke_public_execute_on_match_knowledge_chunks`, hand-author the SQL above, then the user runs `supabase link` + `supabase db push` and re-verifies the function's grants (this migration is exactly the verification step this project's standing "verify actual grants" rule calls for, now applied to a function instead of a table).

## Server / client boundaries

None — database-only change, no server/client code touched.

## Implementation requirements

1. Write the migration exactly as specified above — `revoke` from `public` and from `anon`, leaving `authenticated`'s grant untouched.
2. Add the `docs/architecture.md` note (see Files likely to change) documenting the function-grants-default-to-PUBLIC rule as a standing check, the same way the table-grants section already documents its own default-privileges history.

## Security requirements

- `docs/security.md` §11 review checklist: this fix directly closes an "every new tool/function authorizes before executing" gap — until this migration is applied, `match_knowledge_chunks` is reachable by any connection holding only the `anon` role (or no role-specific grant at all, via `PUBLIC`), which under `security invoker` would execute with `anon`'s privileges. Since `knowledge_chunks` RLS policies only grant access to `authenticated` sessions matched to a business's `clerk_org_id`, an `anon` caller's underlying `select` would currently return zero rows regardless (RLS still blocks it) — so this was not a live tenant-isolation breach of the `knowledge_chunks` data itself, but it was a real defense-in-depth failure: the function was reachable by a caller class it was never intended to be reachable by, and the only reason no data leaked is that RLS is still doing its job as the second layer. This fix restores the intended single layer of function-level access control on top of that.
- No new secret, no new env var, no client-facing change.

## Error handling

Not applicable — a `revoke` on a grant that was never actually held by a given role is a no-op in Postgres, not an error, so this migration is safe to apply even if the live grant state turns out to differ slightly from what's described above (verify with the query in Manual testing steps regardless of that safety).

## Acceptance criteria

- [ ] `select grantee, privilege_type from information_schema.role_routine_grants where routine_name = 'match_knowledge_chunks';` shows `authenticated` with `EXECUTE` and no row for `anon` or `PUBLIC`.
- [ ] An `anon`-role (or no-role) call to `match_knowledge_chunks` is rejected with a permission error, not a (possibly RLS-empty) result.
- [ ] An `authenticated`-role call still succeeds exactly as before.
- [ ] `docs/architecture.md`'s Database section documents the function-grants-default-to-PUBLIC rule.

## Automated checks

- No `npm run lint` / `npx tsc --noEmit` / `npm run build` impact expected (no application code changes) — run them anyway per `AGENTS.md` §7's "after every implementation" requirement, and report the real result rather than assuming a pass.
- `supabase test db` — no new pgTAP test is being added for this fix (the existing `008_match_knowledge_chunks_tenant_isolation.sql` already runs entirely as `authenticated`, so it wouldn't have caught this `anon`/`PUBLIC` gap in the first place, and role-execute-grant testing is a different kind of check than pgTAP's row-level RLS assertions). Verified instead via the SQL query in Manual testing steps.

## Manual testing steps

1. Apply the new migration.
2. In the Supabase SQL editor (or via `psql`), run:
   ```sql
   select grantee, privilege_type
   from information_schema.role_routine_grants
   where routine_name = 'match_knowledge_chunks';
   ```
   Confirm the only row is `authenticated` / `EXECUTE`.
3. As a sanity negative check, `set role anon;` then attempt `select * from public.match_knowledge_chunks('00000000-0000-0000-0000-000000000000'::uuid, '[0]'::extensions.vector(1536), 1);` (any well-formed but arbitrary arguments) — confirm this now fails with a permission-denied error, not a result (empty or otherwise). `reset role;` afterward.
4. Confirm the existing app flow is unaffected: as a real signed-in business member, trigger a knowledge search path that calls `searchKnowledgeChunks` (or re-run this phase's existing manual test from `prompts/phase-7-embeddings-pgvector.md` step 3) and confirm it still returns results as before.

## Out of scope

- Any other function-grant audit beyond `match_knowledge_chunks` — this project has only this one function so far; a broader audit becomes relevant once more functions exist.
- A schema-wide `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (the function equivalent of the Phase 3 table-level fix) — not requested, and doing it now would be scope creep beyond the specific gap reported; worth considering explicitly if/when more functions are added, not decided here.
