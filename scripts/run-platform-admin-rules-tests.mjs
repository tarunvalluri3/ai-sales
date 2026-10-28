// Unit tests for the pure /apache platform-admin gate rules
// (lib/platform-admin-rules.ts) -- Node's built-in test runner + assert,
// same pattern as scripts/run-copilot-lifecycle-tests.mjs. No database, no
// real Clerk session: these are the role-ranking and MFA-freshness
// decisions, tested directly.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { hasMinPlatformRole, hasFreshSecondFactor, secondFactorAgeMinutes, SESSION_MFA_MAX_AGE_MINUTES, STEP_UP_MAX_AGE_MINUTES } =
  await import("../lib/platform-admin-rules.ts");

test("hasMinPlatformRole: owner outranks support and viewer", () => {
  assert.equal(hasMinPlatformRole("owner", "owner"), true);
  assert.equal(hasMinPlatformRole("owner", "support"), true);
  assert.equal(hasMinPlatformRole("owner", "viewer"), true);
});

test("hasMinPlatformRole: viewer does not meet support or owner", () => {
  assert.equal(hasMinPlatformRole("viewer", "support"), false);
  assert.equal(hasMinPlatformRole("viewer", "owner"), false);
  assert.equal(hasMinPlatformRole("viewer", "viewer"), true);
});

test("hasMinPlatformRole: support meets support and viewer, not owner", () => {
  assert.equal(hasMinPlatformRole("support", "support"), true);
  assert.equal(hasMinPlatformRole("support", "viewer"), true);
  assert.equal(hasMinPlatformRole("support", "owner"), false);
});

test("secondFactorAgeMinutes: reads the second element of fva", () => {
  assert.equal(secondFactorAgeMinutes({ fva: [3, 12] }), 12);
});

test("secondFactorAgeMinutes: missing/malformed claim returns null", () => {
  assert.equal(secondFactorAgeMinutes(null), null);
  assert.equal(secondFactorAgeMinutes(undefined), null);
  assert.equal(secondFactorAgeMinutes({}), null);
  assert.equal(secondFactorAgeMinutes({ fva: [3] }), null);
  assert.equal(secondFactorAgeMinutes({ fva: "nope" }), null);
});

test("hasFreshSecondFactor: -1 (never verified this session) is never fresh", () => {
  assert.equal(hasFreshSecondFactor({ fva: [0, -1] }, SESSION_MFA_MAX_AGE_MINUTES), false);
});

test("hasFreshSecondFactor: within the ceiling is fresh, at the exact ceiling is fresh, past it is not", () => {
  assert.equal(hasFreshSecondFactor({ fva: [0, 10] }, 60), true);
  assert.equal(hasFreshSecondFactor({ fva: [0, 60] }, 60), true);
  assert.equal(hasFreshSecondFactor({ fva: [0, 61] }, 60), false);
});

test("hasFreshSecondFactor: the strict step-up ceiling is much shorter than the session ceiling", () => {
  assert.equal(hasFreshSecondFactor({ fva: [0, 10] }, STEP_UP_MAX_AGE_MINUTES), false);
  assert.equal(hasFreshSecondFactor({ fva: [0, 4] }, STEP_UP_MAX_AGE_MINUTES), true);
});

test("hasFreshSecondFactor: no session claims at all is never fresh", () => {
  assert.equal(hasFreshSecondFactor(null, SESSION_MFA_MAX_AGE_MINUTES), false);
  assert.equal(hasFreshSecondFactor(undefined, SESSION_MFA_MAX_AGE_MINUTES), false);
});
