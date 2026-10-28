// Unit tests for lib/admin-impersonation-rules.ts -- the pure expiry and
// countdown math behind Support Tools' time-boxed impersonation (Phase 33
// Stop 5, docs/phases.md). Same pattern as
// scripts/run-platform-admin-rules-tests.mjs.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { computeImpersonationExpiry, isImpersonationExpired, remainingImpersonationSeconds, IMPERSONATION_MAX_MINUTES } = await import(
  "../lib/admin-impersonation-rules.ts"
);

test("IMPERSONATION_MAX_MINUTES is the approved brief's 30-minute ceiling", () => {
  assert.equal(IMPERSONATION_MAX_MINUTES, 30);
});

test("computeImpersonationExpiry: exactly 30 minutes after start", () => {
  const start = new Date("2026-11-05T10:00:00.000Z");
  assert.equal(computeImpersonationExpiry(start).toISOString(), "2026-11-05T10:30:00.000Z");
});

test("isImpersonationExpired: false before the deadline, true at and after it", () => {
  const expiresAt = "2026-11-05T10:30:00.000Z";
  assert.equal(isImpersonationExpired(expiresAt, new Date("2026-11-05T10:29:59.000Z")), false);
  assert.equal(isImpersonationExpired(expiresAt, new Date("2026-11-05T10:30:00.000Z")), true);
  assert.equal(isImpersonationExpired(expiresAt, new Date("2026-11-05T10:31:00.000Z")), true);
});

test("remainingImpersonationSeconds: counts down to zero and never goes negative", () => {
  const expiresAt = "2026-11-05T10:30:00.000Z";
  assert.equal(remainingImpersonationSeconds(expiresAt, new Date("2026-11-05T10:20:00.000Z")), 600);
  assert.equal(remainingImpersonationSeconds(expiresAt, new Date("2026-11-05T10:30:00.000Z")), 0);
  assert.equal(remainingImpersonationSeconds(expiresAt, new Date("2026-11-05T10:45:00.000Z")), 0);
});
