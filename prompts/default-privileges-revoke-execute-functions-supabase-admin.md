# Fix function default privileges targeting the wrong owning role (supabase_admin)

## Goal

After this is implemented, newly created functions in the `public` schema have zero default `EXECUTE` access for `anon`/`authenticated` **regardless of which role actually creates them** — closing the real gap: two prior migrations changed the default ACL for the *current session's role* (effectively `postgres`), but Supabase's own tooling provisions new objects under `supabase_admin`, which has its own, separate default ACL entry that neither prior migration ever touched.

## Current phase

Pre-Phase-8 cleanup item (blocking the Phase 8 — LangChain RAG prompt). Confirmed from `STATE.md` §1. Third attempt at the same underlying gap.

## User request

"Found the actual root cause via `pg_default_acl`: there are TWO default ACL entries for functions in `public` — one owned by `supabase_admin` (grants `anon`/`authenticated`/`postgres`/`service_role`), one owned by `postgres` (grants only `postgres`/`service_role`, already clean). The migration so far has only ever affected the `postgres`-owned default [...] it never touched the `supabase_admin`-owned one, which is the one actually governing new objects since Supabase's tooling provisions under `supabase_admin`. [...] Fix needs: `alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, authenticated;` [...] Write this as a third migration, and update `docs/architecture.md` [...] Verify with the same `has_function_privilege()` throwaway-function check before considering this closed."

## Skills and docs read

- `docs/architecture.md`'s "Database" section — the note this is the third and (per the user's diagnosis) actually-correct correction to.
- `docs/security.md` §3, §8 — same relevance as the prior two fixes in this area: function-level access control matters more once Phase 14 (AI tools/actions) starts adding genuine tool-execution surfaces.
- `STATE.md` §1 — confirms this is the sole remaining item blocking the Phase 8 prompt.

## Existing code inspected

- `supabase/migrations/20260812191914_default_privileges_revoke_execute_on_functions.sql` — first attempt, `revoke execute on functions from public;`, no `FOR ROLE` clause (defaults to the current session's role — effectively `postgres`). Confirmed by the user's `pg_default_acl` query to have only ever modified the `postgres`-owned default ACL entry, which grants only `postgres`/`service_role` and was already effectively harmless.
- `supabase/migrations/20260812200105_default_privileges_revoke_execute_functions_anon_authenticated.sql` — second attempt, named `anon`/`authenticated` explicitly instead of relying on `PUBLIC`, but still with no `FOR ROLE` clause — so it corrected the *wrong half* of the actual problem (it fixed which roles were named, but not which owning role's default ACL was being edited). Confirmed by the user's live `has_function_privilege()` check to still leave a throwaway function executable by both `anon` and `authenticated`.
- `supabase/migrations/20260811150450_default_privileges_least_privilege.sql` — the Phase 3 table-level precedent this whole line of fixes has been mirroring. **Not re-verified for the same `supabase_admin`-vs-`postgres` split by this prompt** (see Decisions/Out of scope) — the user's diagnosis and request are scoped to functions only, based on live `pg_default_acl` evidence specific to functions; extending the same suspicion to tables is a reasonable follow-up but not requested here and not confirmed to actually be a problem there (Phase 5's own throwaway-table verification found zero default grants, which is at least consistent with — though not conclusive proof against — the table case being unaffected).

## Relevant existing architecture

Same standing pattern this project has now hit three times for grants/default-privileges: a project-level or provisioning-level ACL can differ from what a migration's own statement assumes it's changing, and the only reliable way to know is to verify live against the actual system catalogs (`pg_default_acl`, `information_schema.role_routine_grants`, `has_function_privilege()`), not to reason from the SQL alone. `docs/architecture.md`'s note on this topic is being corrected for the second time in the same session — worth being precise this time about *exactly* what was wrong, since the prior "lesson" text was itself an incomplete diagnosis.

## Decisions and assumptions

1. **Scope stays functions in `public`, roles `anon`/`authenticated`, but now explicitly `FOR ROLE supabase_admin`** — per the user's exact diagnosis and instruction. This is the third migration in the same corrective sequence, not a replacement for the prior two (neither prior migration is wrong to have run — they just didn't address the actual owning role).
2. **Not retroactive**, matching every prior fix in this family — doesn't affect `match_knowledge_chunks` (already fixed individually via its own direct `revoke`, unaffected by any of the default-ACL confusion) or anything created before this migration runs.
3. **`service_role` untouched**, same as every prior fix.
4. **Whether the Phase 3 table-level fix has the same `supabase_admin`-vs-`postgres` gap is explicitly out of scope for this prompt** — the user's request and live evidence are scoped to functions. Flagged as a worthwhile follow-up to spot-check later (see Out of scope), not assumed to be broken and not fixed speculatively here.
5. **`docs/architecture.md`'s note gets corrected a second time, not appended to again** — the current text's "lesson" (name the roles explicitly, verify live) was real but incomplete; the actual root cause was the missing `FOR ROLE supabase_admin`, and the note needs to say that precisely so a future reader doesn't reason from the same incomplete lesson the second migration was written under.

## Open decisions this depends on

None.

## Dependencies / packages required

None.

## Files likely to change

**Created:**
- `supabase/migrations/<timestamp>_default_privileges_revoke_execute_functions_supabase_admin.sql`

**Modified:**
- `docs/architecture.md` — correct the function-default-privileges note a second time: record the real root cause (`supabase_admin`-owned default ACL entry, distinct from the `postgres`-owned one), the corrected lesson (Supabase's own tooling provisions objects under `supabase_admin`, so `ALTER DEFAULT PRIVILEGES` fixes on Supabase may need an explicit `FOR ROLE supabase_admin`, not just naming the affected grantee roles), and that this is the third migration in the sequence.
- `STATE.md` — final step, per `AGENTS.md` §0.6; also fully resolves the item blocking Phase 8.

## Database changes

```sql
alter default privileges for role supabase_admin in schema public
revoke execute on functions from anon, authenticated;
```

Not retroactive. Does not affect `match_knowledge_chunks` or any function created before this runs. `service_role` untouched.

**Exact migration commands:** `supabase migration new default_privileges_revoke_execute_functions_supabase_admin`, hand-author the SQL above, then the user runs `npx supabase db push --linked`.

## Server / client boundaries

None — pure database migration, no application code affected.

## Implementation requirements

1. Write the migration with a comment explaining the corrected root cause: two separate default ACL entries exist for functions in `public` — one owned by `postgres` (already effectively clean, the only one the first two migrations ever touched), one owned by `supabase_admin` (grants `anon`/`authenticated`/`postgres`/`service_role`, the one that actually governs new objects since Supabase's own tooling provisions under that role) — confirmed via `pg_default_acl` and via `has_function_privilege()` on a throwaway function still returning `true` for `anon`/`authenticated` after both prior migrations.
2. Correct `docs/architecture.md`'s note (see Files likely to change) — this is a correction of the existing text's "lesson" paragraph, not a third block appended after it. The corrected lesson should say plainly: on Supabase, `ALTER DEFAULT PRIVILEGES` fixes may need `FOR ROLE supabase_admin` explicitly, because that's the role Supabase's tooling actually uses to provision objects — not just the role the migration happens to run as (which the CLI/dashboard usually connects as, e.g. `postgres`).

## Security requirements

Same as the prior two fixes in this family (`docs/security.md` §3, §8) — this is the migration that actually closes the gap for real, so it's the one that matters for correctness, not an incremental improvement over an already-acceptable state.

## Error handling

None — no user-facing code path.

## Acceptance criteria

- [ ] Migration applies cleanly.
- [ ] A throwaway function created *after* this migration shows `anon_can_execute: false` and `authenticated_can_execute: false` via `has_function_privilege()` — the same check that caught both prior incomplete attempts, now expected to actually pass.
- [ ] `pg_default_acl` shows both the `postgres`-owned and `supabase_admin`-owned default ACL entries for functions in `public` with no `anon`/`authenticated` grants.
- [ ] `match_knowledge_chunks`'s own grants remain unchanged: exactly `authenticated` / `EXECUTE`.
- [ ] `docs/architecture.md`'s note is corrected to state the real root cause and the corrected lesson.
- [ ] `STATE.md` reflects this as the migration that actually closes the item blocking Phase 8.

## Automated checks

`npm run lint`, `npx tsc --noEmit`. No application code changes expected, so `npm run build` is not required unless something unexpected changes.

## Manual testing steps

1. Apply: `npx supabase db push --linked`.
2. Re-run the exact check that caught both prior attempts: create a throwaway function, then `select has_function_privilege('anon', '<throwaway function signature>', 'execute')` and the same for `authenticated` — expect `false` for both this time. Drop the throwaway function afterward.
3. Re-run the `pg_default_acl` query, filtered to `defaclobjtype = 'f'` in `public` — confirm both the `postgres`-owned and `supabase_admin`-owned rows now show no `anon`/`authenticated` grants.
4. Re-confirm `match_knowledge_chunks`'s own grants are unchanged via `information_schema.routine_privileges` — exactly one row, `authenticated` / `EXECUTE`.

## Out of scope

- Any change to `match_knowledge_chunks`'s own grants.
- Any application code.
- **Re-auditing the Phase 3 table-level default-privileges fix for the same `supabase_admin`-vs-`postgres` split.** The user's diagnosis and request here are scoped to functions, based on live evidence specific to functions. Phase 5's own throwaway-table verification found zero default grants for tables, which is at least consistent with the table case being fine, but this prompt does not independently re-verify that against `pg_default_acl` the way the function case now has been. Worth a quick spot-check at some point given this session's track record on this exact class of bug, but not decided or done here — flag to the user as a possible follow-up rather than doing it speculatively.
- The Phase 8 prompt itself — written only after this is confirmed.
