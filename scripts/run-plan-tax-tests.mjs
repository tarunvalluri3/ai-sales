// Unit tests for the GST-inclusive price derivation in lib/plans.ts --
// Node's built-in test runner + assert, same approach as
// scripts/run-copilot-lifecycle-tests.mjs (no JS test framework in this
// project). lib/plans.ts is pure (no server-only, no I/O), so it imports
// directly.
//
// Run: npm run test:plan-tax
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { PLANS, ORDERED_PLANS, GST_RATE_PERCENT, taxableValuePaise, taxAmountPaise, gstBreakdown } =
  await import(new URL("../lib/plans.ts", import.meta.url).href);

test("the GST rate these expectations were written against is 18%", () => {
  assert.equal(GST_RATE_PERCENT, 18);
});

// Expected values worked out by hand from gross / 1.18, rounded to the paisa.
const EXPECTED = {
  // 1499 / 1.18 = 1270.3389... -> 1270.34; tax 228.66; halves 114.33 + 114.33
  starter: { gross: 149_900, taxable: 127_034, tax: 22_866, cgst: 11_433, sgst: 11_433 },
  // 3999 / 1.18 = 3388.9830... -> 3388.98; tax 610.02; halves 305.01 + 305.01
  growth: { gross: 399_900, taxable: 338_898, tax: 61_002, cgst: 30_501, sgst: 30_501 },
  // 9999 / 1.18 = 8473.7288... -> 8473.73; tax 1525.27; halves 762.635 each
  // -> CGST 762.63 + SGST 762.64. Rounding both up would give 1525.28.
  scale: { gross: 999_900, taxable: 847_373, tax: 152_527, cgst: 76_263, sgst: 76_264 },
};

for (const [key, want] of Object.entries(EXPECTED)) {
  test(`${key}: monthly gross splits into taxable + CGST + SGST exactly`, () => {
    const plan = PLANS[key];
    assert.equal(plan.monthlyPricePaise, want.gross);
    assert.equal(taxableValuePaise(want.gross), want.taxable);
    assert.equal(taxAmountPaise(want.gross), want.tax);

    const split = gstBreakdown(want.gross, "intra-state");
    assert.equal(split.supply, "intra-state");
    assert.equal(split.cgstPaise, want.cgst);
    assert.equal(split.sgstPaise, want.sgst);
    assert.equal(split.cgstPaise + split.sgstPaise, split.taxPaise);
    assert.equal(split.taxablePaise + split.taxPaise, split.grossPaise);
  });

  test(`${key}: inter-state is one IGST line at the full tax amount`, () => {
    const split = gstBreakdown(want.gross, "inter-state");
    assert.equal(split.supply, "inter-state");
    assert.equal(split.igstPaise, want.tax);
    assert.equal("cgstPaise" in split, false);
    assert.equal("sgstPaise" in split, false);
    assert.equal(split.taxablePaise + split.igstPaise, want.gross);
  });
}

test("Scale is the half-paisa case: naive rounding of both halves over-bills by a paisa", () => {
  const tax = taxAmountPaise(PLANS.scale.monthlyPricePaise);
  assert.equal(tax % 2, 1, "Scale's tax must be an odd number of paise, i.e. each half is x.5");
  const naive = Math.round(tax / 2) * 2;
  assert.notEqual(naive, tax, "independent rounding would not reproduce the tax");
  const split = gstBreakdown(PLANS.scale.monthlyPricePaise, "intra-state");
  assert.equal(split.cgstPaise + split.sgstPaise, tax);
});

test("annual prices are ten months of gross and also split exactly", () => {
  for (const plan of ORDERED_PLANS) {
    assert.equal(plan.annualPricePaise, plan.monthlyPricePaise * 10, `${plan.key}: two months free`);
    for (const supply of ["intra-state", "inter-state"]) {
      const split = gstBreakdown(plan.annualPricePaise, supply);
      const tax = supply === "intra-state" ? split.cgstPaise + split.sgstPaise : split.igstPaise;
      assert.equal(tax, split.taxPaise);
      assert.equal(split.taxablePaise + tax, plan.annualPricePaise);
    }
  }
});

// Exhaustive, not sampled: every integer gross from 1 paisa to ₹1,00,000
// (10,000,000 paise). That covers every real price -- the largest, Scale's
// annual gross, is 9,999,000 paise -- so the invariants are proven at the
// magnitudes where the money actually is. Plain comparisons rather than
// assert.* calls in the hot loop (10M iterations x 4 checks); the first
// violation throws with the offending gross.
const SWEEP_MAX_PAISE = 10_000_000;

test(`invariants hold for EVERY gross from 1 to ${SWEEP_MAX_PAISE} paise`, () => {
  const largestRealGross = Math.max(...ORDERED_PLANS.map((p) => p.annualPricePaise));
  assert.ok(
    SWEEP_MAX_PAISE >= largestRealGross,
    "the sweep must reach the largest real price (annual Scale)",
  );

  let oddTaxCount = 0;
  for (let gross = 1; gross <= SWEEP_MAX_PAISE; gross++) {
    const taxable = taxableValuePaise(gross);
    // taxable is the nearest paisa to gross / 1.18, checked in exact integer terms:
    // |taxable * 118 - gross * 100| <= 59, i.e. within half a paisa after scaling.
    if (Math.abs(taxable * 118 - gross * 100) > 59) {
      throw new Error(`taxable is not the nearest paisa at gross=${gross}`);
    }

    const intra = gstBreakdown(gross, "intra-state");
    if (intra.cgstPaise + intra.sgstPaise !== intra.taxPaise) {
      throw new Error(`CGST+SGST != tax at gross=${gross}`);
    }
    if (intra.taxablePaise + intra.taxPaise !== gross) {
      throw new Error(`taxable+tax != gross at gross=${gross}`);
    }
    if (intra.cgstPaise < 0 || intra.sgstPaise - intra.cgstPaise > 1 || intra.sgstPaise < intra.cgstPaise) {
      throw new Error(`CGST/SGST not a floor/remainder split at gross=${gross}`);
    }

    const inter = gstBreakdown(gross, "inter-state");
    if (inter.igstPaise !== intra.taxPaise || inter.taxablePaise + inter.igstPaise !== gross) {
      throw new Error(`IGST != tax, or taxable+IGST != gross, at gross=${gross}`);
    }
    if (intra.taxPaise % 2 === 1) oddTaxCount++;
  }
  // The odd-paisa branch must actually have been exercised, or the sweep proves nothing about it.
  assert.ok(oddTaxCount > 1_000_000, "sweep should hit the odd-tax (half-paisa) case very often");
});
