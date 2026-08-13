# Neutralize the permanently-blocked default-privileges migration

## Goal

After this is implemented, `npx supabase db push --linked` no longer fails at `20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql` with `permission denied to change default privileges` (Postgres `42501`), so Phase 10's two pending migrations can actually be pushed. The migration file itself becomes a documented no-op — its investigation comments stay as the historical record, its `alter default privileges for role supabase_admin ...` statement is removed.

## Current phase

Phase 10 — Lead extraction and creation (implemented, migrations written but not yet applied — `STATE.md` §1/§3). This is a small, scoped fix to a migration-application blocker discovered while trying to push Phase 10's migrations, not itself a phase.

## User request

The user reported that `20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql` blocks `db push --linked` with the exact `42501` error already recorded in `STATE.md` §1/§8 as a closed, abandoned platform constraint — but the migration file itself was never actually neutralized after that investigation closed, so it still sits in the migration history ahead of Phase 10's two new migrations and blocks every future push. Requested fix: remove the actual `alter default privileges for role supabase_admin ...` statement from that one file, turning it into a no-op, while keeping its comments for the record. Explicitly do not touch `20260812191914_...` or `20260812200105_...` (the first two attempts in the same investigation).

## Skills and docs read

- `STATE.md` §1, §2 (Phase 7 entry), §8 — the full record of this investigation: three migrations attempted, the first two applied but ineffective, the third confirmed to fail with `42501` and accepted as a platform constraint with no normal-connection workaround, standing rule adopted instead (per-function `revoke execute` discipline).
- `docs/architecture.md`'s function-default-privileges note — the corresponding narrative record, already describes the third migration as "failed to apply," consistent with what's being fixed here.
- `AGENTS.md` §5 — this is a migration file change, explicitly excluded from the trivial-change exemption regardless of size, so it follows the full prompt-first workflow per the user's own instruction.

## Existing code inspected

- `supabase/migrations/20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql` (read in full) — 21 lines of comment recording the investigation's conclusion (two separate `pg_default_acl` entries, `postgres`-owned vs. `supabase_admin`-owned, why the first two migrations missed the real one), followed by the two-line statement that fails with `42501` on every push attempt: `alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, authenticated;`.
- `supabase/migrations/20260812191914_default_privileges_revoke_execute_on_functions.sql`, `20260812200105_default_privileges_revoke_execute_functions_anon_authenticated.sql` — both confirmed to exist as-is; neither is touched by this fix, per the user's explicit instruction. Both already applied successfully in the past (they just didn't fix the real gap) — they are not blocking anything.

## Relevant existing architecture

- Migrations are the schema source of truth (`docs/architecture.md`'s Database section) — once a migration file is part of the committed history, it isn't deleted or renumbered; a migration that can never succeed against the live project is neutralized in place (turned into a no-op) rather than removed, so the migration sequence stays intact and future `db push` runs can get past it.
- The standing rule this investigation produced — every new function gets its own explicit `revoke execute ... from anon` in its own migration, verified live — is unaffected by this fix and remains in force for Phase 10 (neither `conversations` nor `leads` introduces a new function, so it isn't triggered by Phase 10 anyway).

## Decisions and assumptions

1. **Neutralize in place, don't delete the file.** Deleting a migration that's part of the committed sequence would be a more disruptive, harder-to-reverse change than commenting out its one statement, and the file's comments are explicitly wanted as the historical record per the user's request.
2. **Only the SQL statement is removed; every comment line stays verbatim.** No rewording, no shortening — the user asked to keep the investigation comments, not a summary of them.
3. **A one-line comment is added noting the statement was removed and why**, so a future reader of this file (who wasn't part of this conversation) understands why a migration file with no SQL statement exists at all, rather than assuming it's a mistake or an incomplete file.
4. **No change to `20260812191914_...` or `20260812200105_...`**, exactly as instructed — they already applied successfully in the past; touching them now would be pointless (they can't be re-applied) and outside the explicit scope of this request.

## Open decisions this depends on

None.

## Dependencies / packages required

None.

## Files likely to change

- `supabase/migrations/20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql` — the `alter default privileges ...` statement removed; all existing comments kept; one new comment line explaining the removal.
- `docs/architecture.md` — the function-default-privileges note's description of this migration adjusted from "failed to apply" (past tense, describing a push attempt) to also note it's now a neutralized no-op in the file itself, so the doc matches the file's actual current content.
- `STATE.md` — §1/§8's existing "failed to apply" language gets a short addendum noting the file was neutralized so it stops blocking future pushes; §2's Phase 10 entry's "migrations not yet applied" note can now reflect that the push is expected to get past this blocker.

## Database changes

None to the live database — this migration never successfully applied its statement and still won't (it now has none). This is a change to a migration **file**, not a live schema change. No new migration is added; Phase 10's own two migrations (`20260813120000_...`, `20260813120005_...`) are unaffected and unchanged by this fix.

## Server / client boundaries

None — this is a migration-file-only change.

## Implementation requirements

1. Open `supabase/migrations/20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql`.
2. Remove exactly these two lines (the SQL statement):
   ```sql
   alter default privileges for role supabase_admin in schema public
   revoke execute on functions from anon, authenticated;
   ```
3. Keep all 21 existing comment lines exactly as they are.
4. Append one new comment line/paragraph after the existing comments, stating plainly: this statement is removed because it permanently fails with `permission denied to change default privileges` (`42501`) on every `db push` attempt against this managed Supabase project — altering another role's (`supabase_admin`'s) default privileges requires membership in that role, which the migration connection never has, and there is no normal-connection workaround. This file is intentionally a no-op from here on; see `STATE.md` §1/§8 for the full investigation and the standing per-function mitigation adopted instead.
5. Do not modify `20260812191914_default_privileges_revoke_execute_on_functions.sql` or `20260812200105_default_privileges_revoke_execute_functions_anon_authenticated.sql` in any way.

## Security requirements

None beyond what's already recorded: this migration's removal doesn't reopen anything, since it never successfully executed in the first place — `match_knowledge_chunks` and every other function's `execute` grant are unaffected, per-function discipline (the standing rule) remains the actual mitigation in force.

## Error handling

Not applicable — no runtime code changes.

## Acceptance criteria

- [ ] `supabase/migrations/20260812213356_...sql` contains only comments (no `alter default privileges` statement).
- [ ] `20260812191914_...sql` and `20260812200105_...sql` are byte-for-byte unchanged.
- [ ] `npx supabase db push --linked` (run by the user, not this environment) proceeds past `20260812213356_...sql` without the `42501` error and successfully applies Phase 10's two pending migrations.
- [ ] `docs/architecture.md` and `STATE.md` accurately describe the file as neutralized, not just "failed to apply."

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

(None of these actually exercise SQL migration files, but are run per `AGENTS.md` §7's standing requirement after any implementation, to confirm nothing else was inadvertently touched.)

## Manual testing steps

1. User runs `npx supabase db push --linked`. Confirm the push no longer fails at `20260812213356_...sql`, and confirm Phase 10's two migrations (`20260813120000_create_conversations_table.sql`, `20260813120005_create_leads_table.sql`) apply successfully.
2. Confirm via `has_function_privilege()` (or `information_schema.role_routine_grants`) that `match_knowledge_chunks`'s existing `anon`/`authenticated` grants are unchanged by this — this file's removal should have zero observable effect on the live database, since the statement it used to contain never successfully ran.

## Out of scope

- Any further attempt at a schema-wide default-privileges fix for functions — closed, per `STATE.md` §1/§8, not reopened here.
- Any change to `20260812191914_...` or `20260812200105_...`.
- Phase 10's own migrations — unaffected, unchanged.
