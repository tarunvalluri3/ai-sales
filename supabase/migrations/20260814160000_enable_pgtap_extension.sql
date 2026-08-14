-- Enables pgTAP so the pgTAP test files under supabase/tests/database/ can
-- run against this project (Phase 19b, docs/phase-19-audit-findings.md §9,
-- STATE.md's Phase 19b entry). Same shape as
-- 20260812161845_enable_pgvector_extension.sql -- installed into the
-- `extensions` schema, not `public`, consistent with this project's
-- existing extension convention.
--
-- Chosen deliberately, at the user's explicit direction, to run these
-- tests against this live project rather than a disposable local stack
-- (no Docker/Podman available in either the implementing session or the
-- user's own environment) -- see the "pgTAP live wiring" section of
-- prompts/phase-19b-production-hardening-remediation.md for the full
-- reasoning and the rollback-safety verification this migration's
-- application was gated behind.

create extension if not exists pgtap with schema extensions;
