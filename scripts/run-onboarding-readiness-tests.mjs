// Unit tests for the onboarding readiness rules in lib/onboarding-readiness.ts
// (feat/onboarding-readiness). Node's built-in test runner + assert, same
// approach as scripts/run-plan-tax-tests.mjs. The module is pure (no
// server-only, no I/O), so it imports directly via the @/ alias hook.
//
// Covers the brief's required cases: each requirement independently blocks a
// first publish, a failed/processing knowledge source does not count as
// ready, two valid FAQs fail / three pass, and the gate decision a direct
// (UI-bypassing) publish is checked against -- evaluateReadiness().canPublish
// is the single source of truth the server gate (lib/business.ts
// publishBusinessForOrg) rejects on.
//
// Run: npm run test:onboarding-readiness
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const {
  evaluateReadiness,
  isDismissibleItemKey,
  DESCRIPTION_MIN_LENGTH,
  MIN_READY_FAQS,
} = await import(new URL("../lib/onboarding-readiness.ts", import.meta.url).href);

const LONG_DESCRIPTION = "We sell handmade oak furniture to homeowners across the country.";
assert.ok(LONG_DESCRIPTION.length >= DESCRIPTION_MIN_LENGTH, "fixture description must clear the minimum");

function readyKnowledgeSource(sourceType = "faq") {
  return { sourceType, ingestionStatus: "complete", documentStatus: "published", hasChunks: true };
}

function readyFaq(i) {
  return {
    question: `What are your delivery times for order ${i}?`,
    answer: `Orders usually ship within two to three business days, item ${i}.`,
    generatedDocIngestionStatus: "complete",
  };
}

/** A baseline, fully-ready, never-published ecommerce business (catalog required). */
function baseReadyInput(overrides = {}) {
  return {
    businessType: "ecommerce",
    name: "Acme Furniture",
    description: LONG_DESCRIPTION,
    contactEmail: "owner@acme.test",
    contactPhone: "+1 555 0100",
    website: "https://acme.test",
    privacyPolicyUrl: "https://acme.test/privacy",
    appointmentsEnabled: false,
    alreadyPublished: false,
    knowledgeSources: [readyKnowledgeSource(), readyKnowledgeSource(), readyKnowledgeSource()],
    faqs: [readyFaq(1), readyFaq(2), readyFaq(3)],
    catalogItems: [{ name: "Oak dining table", description: "A solid oak six-seat dining table." }],
    openBusinessHoursDayCount: 0,
    dismissedItemKeys: [],
    ...overrides,
  };
}

function blockingKeys(report) {
  return report.blockingItems.map((i) => i.key).sort();
}

test("a fully-ready, never-published business can publish with nothing blocking", () => {
  const report = evaluateReadiness(baseReadyInput());
  assert.equal(report.canPublish, true);
  assert.equal(report.gateApplies, true);
  assert.deepEqual(report.blockingItems, []);
});

test("description shorter than the minimum blocks publish on its own", () => {
  const report = evaluateReadiness(baseReadyInput({ description: "Shop" }));
  assert.equal(report.canPublish, false);
  assert.deepEqual(blockingKeys(report), ["profile_description"]);
});

test("a null contact email blocks publish on its own", () => {
  const report = evaluateReadiness(baseReadyInput({ contactEmail: null }));
  assert.equal(report.canPublish, false);
  assert.deepEqual(blockingKeys(report), ["profile_contact_email"]);
});

test("a failed knowledge source does not count as ready", () => {
  const report = evaluateReadiness(
    baseReadyInput({
      // Keep the 3 FAQ rows meaningful but mark EVERY knowledge source failed,
      // so there is no retrieval-ready source at all.
      knowledgeSources: [
        { sourceType: "manual", ingestionStatus: "failed", documentStatus: "published", hasChunks: false },
        { sourceType: "faq", ingestionStatus: "failed", documentStatus: "published", hasChunks: false },
      ],
      faqs: [
        { ...readyFaq(1), generatedDocIngestionStatus: "failed" },
        { ...readyFaq(2), generatedDocIngestionStatus: "failed" },
        { ...readyFaq(3), generatedDocIngestionStatus: "failed" },
      ],
    }),
  );
  assert.equal(report.canPublish, false);
  // Both the generic knowledge requirement and the FAQ requirement fail.
  assert.deepEqual(blockingKeys(report), ["faqs_ready", "knowledge_ready"]);
});

test("a still-processing or chunk-less knowledge source does not count as ready", () => {
  const processing = evaluateReadiness(
    baseReadyInput({
      knowledgeSources: [{ sourceType: "manual", ingestionStatus: "processing", documentStatus: "published", hasChunks: false }],
      faqs: [readyFaq(1), readyFaq(2), readyFaq(3)],
    }),
  );
  // FAQs are still ready here, so knowledge_ready is satisfied by them; prove
  // the processing source itself didn't tip an otherwise-empty count.
  const noFaqsProcessing = evaluateReadiness(
    baseReadyInput({
      knowledgeSources: [{ sourceType: "manual", ingestionStatus: "processing", documentStatus: "published", hasChunks: true }],
      faqs: [],
    }),
  );
  assert.ok(blockingKeys(noFaqsProcessing).includes("knowledge_ready"));

  const completeNoChunks = evaluateReadiness(
    baseReadyInput({
      knowledgeSources: [{ sourceType: "manual", ingestionStatus: "complete", documentStatus: "published", hasChunks: false }],
      faqs: [],
    }),
  );
  assert.ok(blockingKeys(completeNoChunks).includes("knowledge_ready"));

  // A draft (unpublished) document doesn't count either.
  const draft = evaluateReadiness(
    baseReadyInput({
      knowledgeSources: [{ sourceType: "manual", ingestionStatus: "complete", documentStatus: "draft", hasChunks: true }],
      faqs: [],
    }),
  );
  assert.ok(blockingKeys(draft).includes("knowledge_ready"));

  void processing;
});

test("two ready FAQs fail the gate; three pass", () => {
  const two = evaluateReadiness(baseReadyInput({ faqs: [readyFaq(1), readyFaq(2)] }));
  assert.equal(two.canPublish, false);
  assert.deepEqual(blockingKeys(two), ["faqs_ready"]);

  const three = evaluateReadiness(baseReadyInput({ faqs: [readyFaq(1), readyFaq(2), readyFaq(3)] }));
  assert.equal(three.canPublish, true);
  assert.ok(three.blockingItems.every((i) => i.key !== "faqs_ready"));
});

test("a FAQ with a stub answer, or whose document hasn't finished, is not a ready FAQ", () => {
  const stub = evaluateReadiness(
    baseReadyInput({
      faqs: [
        readyFaq(1),
        readyFaq(2),
        { question: "Do you deliver?", answer: "Yes.", generatedDocIngestionStatus: "complete" },
      ],
    }),
  );
  assert.ok(blockingKeys(stub).includes("faqs_ready"), "a one-word answer is not meaningful");

  const notFinished = evaluateReadiness(
    baseReadyInput({
      faqs: [readyFaq(1), readyFaq(2), { ...readyFaq(3), generatedDocIngestionStatus: "processing" }],
    }),
  );
  assert.ok(blockingKeys(notFinished).includes("faqs_ready"), "a FAQ whose document is still processing isn't retrievable yet");
});

test("a catalog-relevant business must have a product or service; a non-catalog type need not", () => {
  const ecommerceNoCatalog = evaluateReadiness(baseReadyInput({ catalogItems: [] }));
  assert.equal(ecommerceNoCatalog.canPublish, false);
  assert.deepEqual(blockingKeys(ecommerceNoCatalog), ["catalog_present"]);

  const otherNoCatalog = evaluateReadiness(baseReadyInput({ businessType: "other", catalogItems: [] }));
  assert.equal(otherNoCatalog.canPublish, true, "a non-catalog type only recommends a product/service");
  const catalogItem = otherNoCatalog.items.find((i) => i.key === "catalog_present");
  assert.equal(catalogItem.tier, "recommended");
});

test("a product needs a real description, not just a name", () => {
  const report = evaluateReadiness(baseReadyInput({ catalogItems: [{ name: "Table", description: "oak" }] }));
  assert.deepEqual(blockingKeys(report), ["catalog_present"]);
});

test("marking catalog not-applicable clears the block for a catalog-required type", () => {
  const report = evaluateReadiness(
    baseReadyInput({ catalogItems: [], dismissedItemKeys: ["catalog_present"] }),
  );
  assert.equal(report.canPublish, true);
  const catalogItem = report.items.find((i) => i.key === "catalog_present");
  assert.equal(catalogItem.status, "not_applicable");
  assert.equal(catalogItem.blocksPublish, false);
});

test("dismissing a genuinely-required item has no effect (it can never be waived)", () => {
  const report = evaluateReadiness(
    baseReadyInput({ description: "Shop", dismissedItemKeys: ["profile_description"] }),
  );
  assert.equal(report.canPublish, false);
  assert.deepEqual(blockingKeys(report), ["profile_description"]);
  assert.equal(isDismissibleItemKey("profile_description"), false);
  assert.equal(isDismissibleItemKey("catalog_present"), true);
});

test("business hours are required only when appointment booking is on", () => {
  const bookingNoHours = evaluateReadiness(baseReadyInput({ appointmentsEnabled: true, openBusinessHoursDayCount: 0 }));
  assert.equal(bookingNoHours.canPublish, false);
  assert.deepEqual(blockingKeys(bookingNoHours), ["business_hours"]);

  const bookingWithHours = evaluateReadiness(baseReadyInput({ appointmentsEnabled: true, openBusinessHoursDayCount: 2 }));
  assert.equal(bookingWithHours.canPublish, true);

  const noBookingNoHours = evaluateReadiness(baseReadyInput({ appointmentsEnabled: false, openBusinessHoursDayCount: 0 }));
  assert.equal(noBookingNoHours.canPublish, true, "without booking, hours are only recommended");
});

test("the gate blocks a direct first publish that bypasses the UI (canPublish is the sole verdict)", () => {
  // Every required item unmet, never published: this is exactly the state the
  // server gate (publishBusinessForOrg) refuses -- it reads report.canPublish,
  // not any client-sent flag, so a direct action call cannot skip it.
  const report = evaluateReadiness(
    baseReadyInput({
      description: null,
      contactEmail: null,
      knowledgeSources: [],
      faqs: [],
      catalogItems: [],
    }),
  );
  assert.equal(report.gateApplies, true);
  assert.equal(report.canPublish, false);
  assert.ok(report.blockingItems.length >= 4);
});

test("an already-published business is never gated, even if it now fails every required item", () => {
  const report = evaluateReadiness(
    baseReadyInput({
      alreadyPublished: true,
      description: null,
      contactEmail: null,
      knowledgeSources: [],
      faqs: [],
      catalogItems: [],
    }),
  );
  // Gate bypassed: a working live agent is never switched off by this rule...
  assert.equal(report.canPublish, true);
  assert.equal(report.gateApplies, false);
  // ...but the audit still truthfully lists what's missing.
  assert.ok(report.blockingItems.length >= 4);
});

test(`the FAQ minimum is ${MIN_READY_FAQS} and the description minimum is ${DESCRIPTION_MIN_LENGTH} (the rules these tests assume)`, () => {
  assert.equal(MIN_READY_FAQS, 3);
  assert.equal(DESCRIPTION_MIN_LENGTH, 40);
});
