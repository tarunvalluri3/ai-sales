# Tighten `businesses` table grants to least privilege

## Goal
After this is implemented, `public.businesses` has exactly the table-level privileges its RLS design assumes: `authenticated` holds `SELECT` only, `anon` holds nothing. No behavior changes for legitimate callers — RLS was already the operative gate (see the diagnosis below) — this closes the `TRUNCATE`-bypasses-RLS gap and removes dead/dangerous grants that don't match the documented access model.

## Current phase
Phase 3 — Supabase + PostgreSQL foundation (per `STATE.md` §1, still pending your full verification). This is a follow-up fix to that phase's migration, not new phase scope.

## User request
User ran the Data API/grant check manually after Phase 3 and found `anon` and `authenticated` both hold full CRUD plus `TRUNCATE`/`REFERENCES`/`TRIGGER` on `businesses` — broader than Decision 4 of the Phase 3 prompt intended (`SELECT`-only for `authenticated`, nothing for `anon`). Diagnosed as pre-existing database-level default-privilege grants from project creation (pre-dating Supabase's April 2026 auto-expose opt-out change), sitting underneath and unaffected by the migration's explicit `grant select ... to authenticated`. User confirmed this needs its own prompt (touches DB/security, not eligible for the trivial-change exemption) and specified the exact revokes.

## Skills and docs read
- `.claude/skills/supabase/SKILL.md` — re-confirms: RLS-enabled tables still require correct table-level grants; Data API exposure is a separate axis from RLS. Nothing in the skill discusses `ALTER DEFAULT PRIVILEGES` specifically, so the diagnosis is Postgres-fundamentals reasoning (grants are additive, not authoritative) plus the observed grant list, not a re-guess from a doc.
- `docs/security.md` §3 (RLS strategy) and §11 (review checklist) — this fix is a direct instance of "never leave a business-owned table with RLS off *and* an unscoped access path"; here RLS is on, but the *grant* was unscoped, which is the same category of gap at the privilege layer instead of the policy layer.
- `supabase/config.toml`'s `[api] auto_expose_new_tables` comment (read during Phase 3) — corroborates that Supabase's new-project default changed away from auto-granting broad access, implying this project's existing default privileges predate that change and won't self-correct.

## Existing code inspected
- `supabase/migrations/20260811124354_create_businesses_table.sql` (Phase 3) — contains `grant select on public.businesses to authenticated;` and the one `SELECT` policy. Does not (and structurally cannot) revoke privileges granted by a separate, earlier `ALTER DEFAULT PRIVILEGES` statement — that statement lives outside any migration this project has written, at the database/role level from project provisioning.
- No existing migration touches grants on `anon` or revokes anything — this is the first.

## Relevant existing architecture
- `docs/architecture.md`'s "Database" section (Phase 3): imperative migrations under `supabase/migrations/`, RLS-first tenant isolation, explicit `GRANT` required alongside RLS since new tables aren't auto-exposed. This prompt adds a note there (Requirement 3) that a migration's explicit `GRANT` is not guaranteed to be the *only* grant in effect — verify actual grants after applying, don't assume.

## Decisions and assumptions
1. **Scope: `businesses` table only, not a database-wide default-privileges fix.** The user asked for a small, targeted follow-up for the one table that exists. A broader fix (e.g., `alter default privileges in schema public revoke ... from anon, authenticated;` so *future* tables don't inherit the same broad grants automatically) is a real, related improvement but wasn't requested and would silently widen this prompt's scope. Flagged under Out of scope for a deliberate future decision, not done here.
2. **This is a new migration file, not a manual Studio/SQL edit.** Per the Phase 3-established convention (`docs/architecture.md` "Database"), schema/privilege changes go through `supabase migration new`, so the fix is reproducible across local/staging/prod rather than a one-off hand-applied change that drifts from migration history.
3. **`service_role` is untouched.** It's expected and correct for `service_role` to bypass RLS and hold broad privileges by design (`docs/security.md` §3) — nothing about this fix concerns it.

## Open decisions this depends on
None.

## Dependencies / packages required
None.

## Files likely to change
**Created:**
- `supabase/migrations/<timestamp>_tighten_businesses_grants.sql` (exact name from `supabase migration new tighten_businesses_grants` — do not hand-invent the timestamp).

**Modified:**
- `docs/architecture.md` — add the grants-verification note to the "Database" section (Requirement 3).
- `STATE.md` — record the fix and the corrected grant state once verified.

**Deleted:** None.

## Database changes
New migration, exact SQL:
```sql
revoke all on public.businesses from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.businesses from authenticated;
```
Leaves the existing `grant select on public.businesses to authenticated;` (from the Phase 3 migration) untouched and in effect — do not re-grant it here, it already exists; this migration only removes what shouldn't be there.

Exact migration command: `supabase migration new tighten_businesses_grants`, then hand-author the SQL above into the generated file.

## Server / client boundaries
No change. This is a database-privilege fix only; no application code changes.

## Implementation requirements
1. `supabase migration new tighten_businesses_grants`, write the exact SQL from "Database changes" into the generated file.
2. Do not touch the `SELECT` policy, the `SELECT` grant to `authenticated`, RLS enable/force state, or any other part of the `businesses` table — this is a privilege-tightening fix only, not a redesign.
3. `docs/architecture.md` "Database" section: add a short note — *"New Supabase tables may inherit broad default privileges from database-level `ALTER DEFAULT PRIVILEGES` set at project provisioning time, independent of any `GRANT` a migration adds. After applying a migration that creates a table, verify the table's actual grants (e.g. via the Dashboard's table permissions view or `\dp public.<table>` / `information_schema.role_table_grants`) rather than assuming the migration's explicit `GRANT` is the only one in effect."*
4. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, or anything under `app/`/`lib/` — this is a pure database-grants fix.

## Security requirements
- Reference `docs/security.md` §11 review checklist — this fix directly closes an unscoped-access-path gap at the grant layer.
- Confirms/enforces principle of least privilege: each Data-API-reachable role holds exactly the privileges its RLS policies assume, no more.

## Error handling
Not applicable — this is a schema/privilege migration, no runtime code path.

## Acceptance criteria
- [ ] New migration file exists with exactly the two `revoke` statements above
- [ ] After applying: `authenticated` holds `SELECT` only on `businesses` (no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER`)
- [ ] After applying: `anon` holds no privileges on `businesses`
- [ ] `service_role`'s privileges are unchanged
- [ ] The existing cross-tenant `SELECT` behavior (an authenticated user sees only their own org's row) is unchanged — this fix must not regress the Phase 3 access model, only remove excess
- [ ] `docs/architecture.md` has the new grants-verification note
- [ ] `STATE.md` updated once you've applied and re-verified the grants

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
(No application code changes are expected, so these should be unaffected — run them anyway to confirm nothing was accidentally touched.) No automated DB check is proposed here for the same reason as Phase 3: no Docker/linked-project access in this environment. Verification is yours, same as Phase 3.

## Manual testing steps
1. `supabase link` (if not already) + `supabase db push` to apply the new migration.
2. Re-run the same grant check you used to find this issue (Dashboard table permissions view, or `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'businesses';`) — confirm `anon` has zero rows and `authenticated` has exactly one (`SELECT`).
3. Re-confirm the Data API still works for `authenticated` reading its own business row (the thing that was already working) — this fix should be invisible to legitimate access, only remove what shouldn't have been reachable.
4. Confirm `TRUNCATE public.businesses` fails for both `anon` and `authenticated` (this is the one gap RLS didn't already cover — worth explicitly re-testing, not just trusting the grant list).

## Out of scope
- A database-wide `ALTER DEFAULT PRIVILEGES` fix so *future* tables don't inherit the same broad grants (Decision 1) — flagging this as worth a deliberate follow-up decision, not bundled in here.
- Any change to RLS policies, INSERT/UPDATE/DELETE access design (still Phase 4's job, per Phase 3 Decision 4).
- Any application code change.
