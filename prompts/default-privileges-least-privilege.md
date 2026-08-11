# Default privileges: least-privilege by default for future tables

## Goal
After this is implemented, every table created in `public` from this point forward starts with no default grants to `anon`/`authenticated` — the same least-privilege starting point `businesses` now has after its own fix, but automatic, so it doesn't need to be repeated per table. This is a database-level policy change (`ALTER DEFAULT PRIVILEGES`), not a fix to any specific table.

## Current phase
Phase 3 — Supabase + PostgreSQL foundation (per `STATE.md` §1, still pending your full verification). This is preventative follow-up work identified while fixing `businesses`' grants, not new phase scope — explicitly deferred from that fix (`prompts/tighten-businesses-table-grants.md`, Decision 1 / Out of scope) to its own prompt.

## User request
After approving the `businesses`-specific grant fix, user asked for a separate follow-up: `alter default privileges in schema public revoke all on tables from anon, authenticated;` (and the equivalent going forward) so every table created from here on starts least-privilege by default, instead of needing the same fix repeated per table. Kept as its own migration, separate from the `businesses` fix.

## Skills and docs read
- `.claude/skills/supabase/SKILL.md` — RLS/grants security checklist (re-read; doesn't cover `ALTER DEFAULT PRIVILEGES` specifically — this is standard Postgres, not a Supabase-specific mechanism).
- `docs/architecture.md` "Database" section (as amended by `prompts/tighten-businesses-table-grants.md`) — documents that new tables may inherit broad default privileges from project-provisioning-time `ALTER DEFAULT PRIVILEGES`, independent of any migration's explicit `GRANT`. This prompt is the structural fix for that same root cause, applied once instead of per table.
- **Not independently confirmed:** which Postgres role Supabase's migration runner executes as when applying `supabase/migrations/*.sql` (commonly `postgres`, but this project's actual role has not been checked against a live instance — no Docker/linked-project access here, same constraint as Phase 3 and the `businesses` grants fix). `ALTER DEFAULT PRIVILEGES` (without `FOR ROLE`) only changes defaults for objects subsequently created **by the role that runs the ALTER statement** — if that's not the same role that runs later `CREATE TABLE` migrations, this fix silently won't apply to them. Requirement 2 below builds in a verification step for this rather than assuming it.

## Existing code inspected
- `supabase/migrations/20260811124354_create_businesses_table.sql` and `supabase/migrations/20260811145006_tighten_businesses_grants.sql` — both scope their `GRANT`/`REVOKE` to the single existing table, `businesses`. Neither touches default privileges — this is the first migration to do so.
- No table has been created since the `businesses` grants fix, so there's no second data point yet on whether new tables actually inherit broad grants going forward (that inheritance is exactly what this migration prevents, and Requirement 2's test table is how it gets confirmed).

## Relevant existing architecture
- `docs/architecture.md` "Database" — imperative migrations, `supabase migration new <name>` for correctly named files, verify actual grants after any table-creating migration (the note added by the prior fix). This prompt adds one more sentence there once the default-privileges fix is confirmed working (Requirement 3).

## Decisions and assumptions
1. **Scope: `public` schema, `TABLES` only — not sequences, functions, or other object types.** The user's request and the problem observed (`businesses`) were both about tables. Extending to sequences/functions preemptively would be guessing at a problem not yet observed; add it if/when a function or sequence shows the same pattern.
2. **`service_role` is not touched.** Same reasoning as the `businesses` fix — it's expected and correct for `service_role` to hold broad privileges by design.
3. **This migration does not retroactively affect `businesses`** (or any table created before it runs) — `ALTER DEFAULT PRIVILEGES` only governs objects created *after* it executes. `businesses` already has its own fix; this is purely forward-looking.
4. **Verification is built into the migration's rollout, not assumed.** Because the exact execution role for future migrations isn't confirmed (see "Skills and docs read"), Requirement 2 has the implementer create a throwaway test table after this migration applies, confirm it has zero `anon`/`authenticated` grants, then drop it — rather than trusting the `ALTER DEFAULT PRIVILEGES` statement worked without checking.

## Open decisions this depends on
None.

## Dependencies / packages required
None.

## Files likely to change
**Created:**
- `supabase/migrations/<timestamp>_default_privileges_least_privilege.sql` (exact name from `supabase migration new default_privileges_least_privilege` — do not hand-invent the timestamp).

**Modified:**
- `docs/architecture.md` — one additional sentence in "Database" once confirmed working (Requirement 3).
- `STATE.md` — record the fix per its own update instructions.

**Deleted:** None.

## Database changes
New migration, exact SQL:
```sql
alter default privileges in schema public
revoke all on tables from anon, authenticated;
```
Exact migration command: `supabase migration new default_privileges_least_privilege`, then hand-author the SQL above into the generated file.

## Server / client boundaries
No change. Database-level default-privilege policy only; no application code changes.

## Implementation requirements
1. `supabase migration new default_privileges_least_privilege`, write the exact SQL from "Database changes" into the generated file.
2. **Verification step (do this after applying, per Decision 4):** create a throwaway table (e.g. `create table public._grant_check (id uuid primary key default gen_random_uuid());`), check its grants (`select grantee, privilege_type from information_schema.role_table_grants where table_name = '_grant_check';`), confirm `anon`/`authenticated` have zero rows, then `drop table public._grant_check;`. Do this as a manual verification step (SQL editor or `psql`), not as a committed migration — it's a one-time check of the mechanism, not a permanent schema object. If the test table *does* inherit broad grants, the fix didn't apply to the role that creates tables — stop and investigate which role runs migrations before considering this done.
3. Once Requirement 2 confirms it works, add one sentence to `docs/architecture.md`'s "Database" section noting that `public` schema default privileges now exclude `anon`/`authenticated` for new tables, so the per-table `GRANT` a migration adds is what actually opens access (not a redundant belt-and-suspenders statement).
4. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, or anything under `app/`/`lib/`.
5. Do not extend this to sequences, functions, or other schemas (Decision 1) — table-only, `public`-only, unless you ask for more.

## Security requirements
- Direct implementation of `docs/security.md` §11's least-privilege spirit, generalized from a one-table fix to a standing policy — future tables won't repeat the `businesses` gap by default.
- Does not weaken anything: `service_role` untouched, and this only *removes* default grants, it never adds one.

## Error handling
Not applicable — database policy migration, no runtime code path.

## Acceptance criteria
- [ ] New migration file exists with exactly the `alter default privileges` statement above
- [ ] After applying, a freshly created test table in `public` has zero `anon`/`authenticated` grants (Requirement 2), confirmed and the test table dropped
- [ ] `businesses`' own grants are unchanged by this migration (it only affects subsequently created tables)
- [ ] `service_role`'s default behavior is unchanged
- [ ] `docs/architecture.md` updated once confirmed working
- [ ] `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass (expected to be unaffected — no application code touched)
- [ ] `STATE.md` updated once you've applied and verified

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
No automated DB check — same environment constraint as Phase 3 and the `businesses` grants fix (no Docker/linked-project access here). Verification (including Requirement 2's test-table check) is yours.

## Manual testing steps
1. `supabase db push` to apply the new migration.
2. Run Requirement 2's throwaway-table check and confirm zero `anon`/`authenticated` grants on it, then drop it.
3. Confirm `businesses`' grants are still exactly `authenticated: SELECT` / `anon: none` (unchanged by this migration — it's not retroactive).
4. Keep this verification result on hand for Phase 5, when the first real new table (products/services/FAQs) gets created — confirm *that* table also starts with no default grants, as the actual real-world proof this policy works end to end.

## Out of scope
- Sequences, functions, storage, or any schema other than `public` (Decision 1)
- Any change to `businesses`' own grants (already fixed separately)
- Any application code change
