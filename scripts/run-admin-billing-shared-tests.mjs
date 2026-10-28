// Unit tests for lib/admin-billing-shared.ts's monthlyValuePaise() -- the
// monthly/annual normalization shared by the /apache Overview and
// Subscriptions & Billing pages (Phase 33, docs/phases.md). Same pattern
// as scripts/run-platform-admin-rules-tests.mjs.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { monthlyValuePaise } = await import("../lib/admin-billing-shared.ts");
const { PLANS } = await import("../lib/plans.ts");

test("no period dates falls back to the plan's monthly price", () => {
  assert.equal(monthlyValuePaise("starter", null, null), PLANS.starter.monthlyPricePaise);
});

test("a ~30-day period is treated as monthly", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2026-01-31T00:00:00.000Z";
  assert.equal(monthlyValuePaise("growth", start, end), PLANS.growth.monthlyPricePaise);
});

test("a ~365-day period is treated as annual and divided by 12", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2027-01-01T00:00:00.000Z";
  assert.equal(monthlyValuePaise("scale", start, end), Math.round(PLANS.scale.annualPricePaise / 12));
});

test("exactly 60 days is still monthly (the annual branch is strictly >60)", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2026-03-02T00:00:00.000Z"; // 60 days later
  assert.equal(monthlyValuePaise("starter", start, end), PLANS.starter.monthlyPricePaise);
});
