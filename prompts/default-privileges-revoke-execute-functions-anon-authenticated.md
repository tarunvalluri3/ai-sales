# Fix incomplete function-privileges default (anon/authenticated still granted)

## Goal
After this is implemented, every newly created function in the `public`
schema will have **zero** default execute privilege for `anon` and
`authenticated` (not just `PUBLIC`), matching the table-level default
already established in Phase 3. `authenticated` continues to require an
explicit, per-function `grant execute` — exactly as documented, just
actually enforced by the default this time.

## Current phase
Pre-Phase-8 cleanup item (blocking the Phase 8 — LangChain RAG prompt).
Confirmed from `STATE.md` §1.

## User request
Live verification of `prompts/default-privileges-revoke-execute-on-functions.md`
(already marked "implemented" in `STATE.md`) found that migration
incomplete. A throwaway function created after that migration ran still
returned `anon_can_execute: true` and `authenticated_can_execute: true`
via `has_function_privilege()`. This prompt fixes the gap the
verification found, before Phase 8 starts.

## Skills and docs read
- `docs/security.md` §3 (RLS/grants), §8 (AI safety and tool execution —
  future functions will very likely be tool-execution surfaces in
  Phase 14, making this gap materially worse to leave open)
- `docs/architecture.md`'s "Database" section, specifically the
  "Functions default to PUBLIC execute access" note this prompt corrects

## Existing code inspected
- `supabase/migrations/20260812191914_default_privileges_revoke_execute_on_functions.sql`
  — the incomplete fix. Runs `alter default privileges in schema public
  revoke execute on functions from public;` only. Its own comment
  incorrectly asserts the `PUBLIC` default is "not a project-specific
  provisioning artifact like the table case was" — live verification
  disproves this.
- `supabase/migrations/20260811150450_default_privileges_least_privilege.sql`
  — the correct precedent this prompt mirrors. Table-level fix explicitly
  named `anon, authenticated` in addition to whatever `PUBLIC`/standard
  default existed: `revoke all on tables from anon, authenticated;`.
- `supabase/migrations/20260812161850_create_match_knowledge_chunks_function.sql`
  and `20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql`
  — confirms `match_knowledge_chunks` itself is unaffected by this gap
  (fixed individually, predates the schema-wide migration, its grants
  were re-verified live and are still exactly `authenticated` only).

## Relevant existing architecture
This project's standing pattern (`docs/architecture.md`, established in
Phase 3 for tables): a project-level `ALTER DEFAULT PRIVILEGES` set at
provisioning time can grant broader access than a migration's own
explicit `GRANT` implies, because `GRANT` is additive and cannot revoke
a pre-existing grant from another source. The fix is always to name the
actual roles explicitly in a `REVOKE`-based `ALTER DEFAULT PRIVILEGES`
statement, not to assume the SQL-standard default is the only source of
risk.

## Decisions and assumptions
- Scope stays `public` schema, `FUNCTIONS` only, roles `anon` and
  `authenticated` — mirrors the table-level fix's own scoping exactly.
  `service_role` untouched (expected to bypass RLS / hold broad
  privileges by design, same as every other grant fix in this project).
- This migration does not re-touch `match_knowledge_chunks` — it already
  has its own correct, individually-verified grants, and this is a
  default (forward-looking), not retroactive, fix.
- `docs/architecture.md`'s existing note must be corrected, not just
  appended to — the claim that the `PUBLIC` default was "not a
  project-specific provisioning artifact" is factually wrong per the
  live `pg_default_acl` query and should not stand uncorrected for the
  next person who reads it.

## Open decisions this depends on
None.

## Dependencies / packages required
None.

## Files likely to change
- **Created:** `supabase/migrations/<timestamp>_default_privileges_revoke_execute_functions_anon_authenticated.sql`
- **Modified:** `docs/architecture.md` (correct the "Functions default to
  PUBLIC execute access" note), `STATE.md` (see below)

## Database changes
```sql
alter default privileges in schema public
revoke execute on functions from anon, authenticated;
```
Not retroactive. Does not affect `match_knowledge_chunks` (already fixed
individually) or any function created before this runs. `service_role`
untouched.

## Server / client boundaries
None — pure database migration, no application code affected.

## Implementation requirements
1. Write the migration above with a comment explaining the corrected
   understanding: the project's default ACL includes explicit
   provisioning-time grants to `anon` and `authenticated` alongside the
   standard `PUBLIC` grant (cite the live `pg_default_acl` query result
   showing `postgres=X,anon=X,authenticated=X,service_role=X` as the
   actual default before this fix), so revoking from `PUBLIC` alone was
   insufficient — same root cause class as the Phase 3 table-grants gap.
2. Update `docs/architecture.md`'s "Functions default to PUBLIC execute
   access" note: correct the inaccurate "not a project-specific
   provisioning artifact" claim, and record that the fix required naming
   `anon, authenticated` explicitly, matching the table-level precedent.
3. Update `STATE.md`:
   - Record the pre-Phase-8 regression check (direct product
     edit-and-save on a real test business) as **confirmed complete** by
     the user — no error, save completed normally, generated knowledge
     document and chunks correctly regenerated.
   - Record that the original function-privileges migration
     (`20260812191914_...`) was **incomplete**: it correctly revoked
     `PUBLIC` but left explicit provisioning-time grants to `anon` and
     `authenticated` untouched, discovered via live verification, not
     inspection.
   - Record this migration as the corrective fix, with its own
     verification pending until the user runs it live.
   - §1 should continue to block the Phase 8 prompt until this migration
     is applied and re-verified.

## Security requirements
Per `docs/security.md` §3 and §8: every new function must start with
zero default execute access to `anon`/`authenticated`, requiring an
explicit per-function grant. This directly matters for Phase 14 (AI
tools/actions), where new functions are likely to be genuine
tool-execution surfaces, not just read-only retrieval like
`match_knowledge_chunks` — leaving this gap open going into Phase 8+
increases the blast radius of the same class of mistake later.

## Error handling
None — no user-facing code path.

## Acceptance criteria
- [ ] Migration applies cleanly.
- [ ] A throwaway function created *after* this migration shows
      `anon_can_execute: false`, `authenticated_can_execute: false`,
      `public_can_execute: false` via `has_function_privilege()`.
- [ ] `match_knowledge_chunks`'s own grants are unchanged: exactly
      `authenticated` / `EXECUTE`, no `anon`, no `PUBLIC`.
- [ ] `docs/architecture.md`'s note is corrected, not just appended to.
- [ ] `STATE.md` reflects both the confirmed Phase 6 regression check
      and the corrected (two-part) status of the function-privileges fix.

## Automated checks
`npm run lint`, `npx tsc --noEmit`. No application code changes expected,
so `npm run build` is not required unless something unexpected changes.

## Manual testing steps
1. Apply: `npx supabase db push --linked`.
2. Re-run the same three verification queries used to catch this gap:
   - `pg_default_acl` check for `defaclobjtype = 'f'` in `public` —
     confirm no `anon`/`authenticated` entries remain alongside
     `postgres`/`service_role`.
   - Throwaway function create → `has_function_privilege()` for
     `anon`/`authenticated`/`public` → expect all `false` → drop the
     throwaway function.
   - `information_schema.routine_privileges` for `match_knowledge_chunks`
     → expect exactly one row, `authenticated` / `EXECUTE`.

## Out of scope
- Any change to `match_knowledge_chunks`'s own grants.
- Any application code — this is a database-only fix.
- The Phase 8 prompt itself — written only after this is confirmed.
