import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dashboard = "app/(dashboard)/dashboard/";
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function loadAction(path, mocks) {
  const exports = {};
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, URL, File, FormData, performance, console, process,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "zod" || name === "node:crypto") return require(name);
      if (name === "server-only") return {};
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return exports;
}

test("failed FAQ save echoes both fields after React resets the form", async () => {
  const { createFaqAction } = loadAction(dashboard + "faqs/actions.ts", {
    "next/navigation": {},
    "next/cache": {},
    "next/server": {},
    "@/lib/business-context": { requireBusinessContext: async () => ({ businessId: "tenant-a", orgRole: "org:admin" }) },
    "@/lib/auth": { requireMinRole: () => null },
    "@/lib/faqs": { createFaq: async () => { throw new Error("mock failure"); } },
    "@/lib/errors": { logAndGetUserMessage: () => "Unable to save." },
    "@/lib/ingestion-queue": {},
  });
  const form = new FormData();
  form.set("question", "What are your hours?");
  form.set("answer", "Open on weekdays.");
  const result = await createFaqAction({}, form);
  assert.equal(result.error, "Unable to save.");
  assert.equal(result.values?.question, "What are your hours?");
  assert.equal(result.values?.answer, "Open on weekdays.");
});

const onboarding = "app/(dashboard)/onboarding/";
const steps = onboarding + "_components/steps/";
const mockErrors = { logAndGetUserMessage: (error) => { throw error; } };
const unused = () => assert.fail("Unexpected side effect");
const admin = { businessId: "tenant-a", orgId: "org-a", userId: "owner-a", orgRole: "org:admin" };

function formData(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function onboardingActions(business, keys = {}, paths = []) {
  const currency = loadAction("lib/currency.ts", {});
  const schemas = loadAction("lib/schemas/business.ts", {
    "@/lib/widget-i18n": { SUPPORTED_WIDGET_LANGUAGES: ["en"] },
    "@/lib/currency": currency,
  });
  return loadAction(onboarding + "actions.ts", {
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "next/navigation": { redirect: (path) => { throw new Error(path); } },
    "@/lib/auth": { requireAuthContext: async () => admin, requireMinRole: () => null },
    "@/lib/business-context": { requireBusinessContext: async () => admin },
    "@/lib/business": business,
    "@/lib/onboarding-steps": { ONBOARDING_STEPS: ["business", "knowledge"] },
    "@/lib/schemas/business": schemas,
    "@/lib/schemas/weekly-hours": loadAction("lib/schemas/weekly-hours.ts", {}),
    "@/lib/schemas/onboarding-website": loadAction("lib/schemas/onboarding-website.ts", {}),
    "@/lib/timezones": loadAction("lib/timezones.ts", {}),
    "@/lib/currency": currency,
    "@/lib/errors": mockErrors,
    "@/lib/widget-keys": keys,
    "@/lib/audit-log": { recordAuditLogEntry: async () => {} },
  });
}

test("auth pages route signed-in users by the session's organization and publication state", async () => {
  for (const [session, business, destination] of [
    [{}, null, null],
    [{ userId: "owner" }, null, "/onboarding"],
    [{ userId: "owner", orgId: "org-a" }, { live_version_id: null }, "/onboarding"],
    [{ userId: "owner", orgId: "org-a" }, { live_version_id: "published-version" }, "/dashboard"],
  ]) {
    const redirects = [];
    const { redirectSignedInFromAuthPage } = loadAction("lib/auth-page-redirect.ts", {
      "@clerk/nextjs/server": { auth: async () => session },
      "next/navigation": { redirect: (path) => redirects.push(path) },
      "@/lib/agent-published": loadAction("lib/agent-published.ts", {}),
      "@/lib/business": { getBusinessForOrg: async (orgId) => { assert.equal(orgId, "org-a"); return business; } },
    });
    await redirectSignedInFromAuthPage();
    assert.deepEqual(redirects, destination ? [destination] : []);
  }
});

test("creation validates and forwards edited hours and the contact phone for the authorized organization", async () => {
  const calls = [];
  const actions = onboardingActions({
    createBusinessForOrg: async (orgId, input) => calls.push({ orgId, input }),
    saveOnboardingStep: async () => {},
  });
  const form = formData({
    name: "Test clinic", businessType: "healthcare", contactEmail: "owner@example.com",
    description: "We offer routine dental care in Hyderabad to adults and children.",
    contactPhone: "+91 98765 43210", timezone: "Asia/Calcutta", currency: "INR",
    editedHours: "true", "day-1-open": "on", "day-1-start": "bad", "day-1-end": "18:00",
  });
  const rejected = await actions.createBusiness({}, form);
  assert.match(rejected.error, /valid start\/end times/);
  assert.equal(calls.length, 0);
  form.set("day-1-start", "10:30");
  await assert.rejects(actions.createBusiness({}, form), /step=knowledge/);
  assert.equal(calls[0].orgId, "org-a");
  assert.equal(calls[0].input.contactPhone, "+91 98765 43210");
  assert.equal(calls[0].input.hours.length, 7);
  assert.equal(calls[0].input.hours[1].startTime, "10:30");
  assert.equal(calls[0].input.hours[2].isOpen, false);
});

test("saving recommended details preserves the saved phone and scopes the update", async () => {
  const row = { contact_phone: "+91 98765 43210" };
  const business = loadAction("lib/business.ts", {
    "react": { cache: (fn) => fn },
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({
      from: (table) => {
        assert.equal(table, "businesses");
        return { update: (patch) => ({ eq: async (column, org) => {
          assert.equal(column, "clerk_org_id");
          assert.equal(org, "org-a");
          Object.assign(row, patch);
          return { error: null };
        } }) };
      },
    }) },
    "@/lib/errors": {}, "@/lib/onboarding-readiness-data": {}, "@/lib/onboarding-readiness": {},
    "@/lib/analytics-events": {}, "@/lib/subscription": {}, "@/lib/agent-published": {},
    "@/lib/billing-cancellation": {}, "@/lib/business-hours-defaults": {}, "@/lib/logger": {},
  });
  const result = await onboardingActions(business).saveOptionalDetailsAction({}, formData({
    website: "https://example.com", privacyPolicyUrl: "https://example.com/privacy",
  }));
  assert.equal(result.success, true);
  assert.equal(row.contact_phone, "+91 98765 43210");
  assert.equal(row.privacy_policy_url, "https://example.com/privacy");
});

test("website setup rejects invalid origins, and save and skip set up a key for the session tenant", async () => {
  const calls = [];
  const paths = [];
  const { saveOnboardingWebsiteAction } = onboardingActions({
    getBusinessForOrg: async () => ({ website: null }),
    updateBusinessOptionalDetails: async (orgId, patch) => {
      assert.equal(orgId, "org-a");
      assert.equal(patch.website, "https://example.com");
      assert.equal(patch.privacyPolicyUrl, undefined);
    },
  }, {
    ensureWidgetKey: async (id, origin) => {
      calls.push([id, origin]);
      return { key: { id: "widget-key-a" }, created: true };
    },
  }, paths);
  for (const address of ["example.com", "https:example.com", "https://example.com/path", "ftp://example.com", "https://example.com?ref=x", "https://user@example.com"]) {
    const result = await saveOnboardingWebsiteAction({}, formData({ website: address }));
    assert.match(result.error, /Enter your website address/);
  }
  assert.equal(calls.length, 0);
  await saveOnboardingWebsiteAction({}, formData({ website: "https://EXAMPLE.com/", businessId: "tenant-b" }));
  await saveOnboardingWebsiteAction({}, formData({ website: "invalid", websiteIntent: "skip" }));
  assert.deepEqual(calls, [["tenant-a", "https://example.com"], ["tenant-a", null]]);
  assert.ok(paths.includes("/onboarding"));
});

test("manual knowledge saves use the existing approval and audit flow, while imports and their edits keep their status", async () => {
  const id = "55555555-0000-4000-8000-111111111111";
  const events = [];
  let type = "manual";
  const { createKnowledgeDocumentAction, createFileKnowledgeDocumentAction, createUrlKnowledgeDocumentAction, updateKnowledgeDocumentInPlaceAction } =
    loadAction(dashboard + "knowledge/actions.ts", {
      "next/navigation": {}, "next/cache": { revalidatePath() {} }, "next/server": { after() {} },
      "@/lib/business-context": { requireBusinessContext: async () => admin },
      "@/lib/auth": { requireMinRole: () => null },
      "@/lib/knowledge": {
        createKnowledgeDocument: async () => ({ id }),
        updateKnowledgeDocument: async (tenant, document) => {
          assert.equal(tenant, "tenant-a");
          return document === id ? type : null;
        },
        publishKnowledgeDocument: async (tenant, document, user) => {
          events.push(["approve", tenant, document, user]);
          return { found: true };
        },
      },
      "@/lib/schemas/knowledge": loadAction("lib/schemas/knowledge.ts", {}),
      "@/lib/errors": mockErrors,
      "@/lib/audit-log": { recordAuditLogEntry: async (...args) => events.push(args) },
      "@/lib/ingestion-queue": {},
      "@/lib/supabase/server": {},
      "@/lib/file-ingestion": { createFileKnowledgeDocument: async () => {} },
      "@/lib/url-ingestion": { createUrlKnowledgeDocument: async () => {} },
      "@/lib/knowledge-extraction": { extractCatalogFromDocument: unused, extractCatalogFromPdfDocument: unused },
    });
  const text = { id, title: "Our weekday schedule", content: "Our staff is available from Monday to Friday at our regular opening times." };
  assert.equal((await createKnowledgeDocumentAction({}, formData(text))).success, true);
  assert.equal((await updateKnowledgeDocumentInPlaceAction({}, formData(text))).success, true);
  assert.deepEqual(events, Array.from({ length: 2 }, () => [
    ["approve", "tenant-a", id, "owner-a"],
    ["tenant-a", "owner-a", "knowledge.published", "knowledge_document", id],
  ]).flat());
  assert.equal((await createFileKnowledgeDocumentAction({}, formData({ file: new File(["Test"], "notes.txt") }))).success, true);
  assert.equal((await createUrlKnowledgeDocumentAction({}, formData({ title: text.title, url: "https://example.com/" }))).success, true);
  for (type of ["file", "url"]) {
    assert.equal((await updateKnowledgeDocumentInPlaceAction({}, formData(text))).success, true);
  }
  assert.match((await updateKnowledgeDocumentInPlaceAction({}, formData({ ...text, id: "55555555-0000-4000-8000-222222222222" }))).error, /no longer exists/);
  assert.equal(events.length, 4);
  for (const path of ["lib/file-ingestion.ts", "lib/url-ingestion.ts"]) {
    assert.match(source(path), /status:\s*"draft"/);
  }
});

test("sandbox tools bypass widget consent after tenant and contact checks, with no writes or notifications", async () => {
  let sourceChannel = "dashboard_test";
  const read = { from: (table) => {
    assert.equal(table, "businesses");
    return { select: () => ({ eq: (column, value) => {
      assert.equal(column, "id");
      assert.equal(value, "tenant-a");
      return { maybeSingle: async () => ({ data: { name: "Test", timezone: "Asia/Kolkata" } }) };
    } }) };
  } };
  const mocks = {
    "next/server": { after: unused },
    "@/lib/conversations": {
      SANDBOX_CONVERSATION_SOURCE: "dashboard_test",
      getConversationForBusiness: async (_client, tenant, id) => {
        assert.equal(tenant, "tenant-a");
        return id === "conversation-a" ? { source: sourceChannel, consent_given: false } : null;
      },
    },
    "@/lib/schemas/lead": { normalizeEmail: (value) => value, normalizePhone: (value) => value },
    "@/lib/appointments": { isSlotAvailable: async () => true, createAppointment: unused, formatSlotLabel: () => "10:00 AM IST" },
    "@/lib/leads": { upsertLeadForConversation: unused },
    "@/lib/webhooks": { enqueueLeadQualifiedWebhooks: unused },
    "@/lib/webhook-delivery": { processWebhookDeliveries: unused },
    "@/lib/notifications": { sendAppointmentReceivedEmail: unused },
    "@/lib/notification-dispatch": { dispatchNotification: unused },
    "@/lib/app-url": {}, "@/lib/logger": { logEvent() {} },
    "@/lib/whatsapp": { WHATSAPP_CONVERSATION_SOURCE: "whatsapp" },
    "@/lib/workflow-engine": { dispatchWorkflowTrigger: unused },
    "@/lib/guardrails/contact-check": { verifyContactAgainstTranscript: (input) => ({ ...input, rejected: [] }) },
    "@/lib/guardrails/write-caps": { loadVisitorTexts: async () => ["owner@example.com"], reserveWriteToolCall: unused },
    "@/lib/guardrails/sanitize": {},
  };
  const { executeBookAppointment } = loadAction("lib/tools/book-appointment.ts", mocks);
  const { executeRequestCallback } = loadAction("lib/tools/request-callback.ts", mocks);
  const input = { startsAt: "2026-11-23T04:30:00Z", contactEmail: "owner@example.com" };
  assert.equal((await executeBookAppointment(read, "tenant-a", "conversation-a", input)).appointmentId, "sandbox");
  assert.equal((await executeRequestCallback(read, "tenant-a", "conversation-a", input)).leadId, "sandbox");
  assert.equal((await executeBookAppointment(read, "tenant-a", "conversation-b", input)).reason, "lookup_failed");
  sourceChannel = "widget";
  assert.equal((await executeBookAppointment(read, "tenant-a", "conversation-a", input)).reason, "consent_required");
  assert.equal((await executeRequestCallback(read, "tenant-a", "conversation-a", input)).reason, "consent_required");
});

test("launch switch and Starter both withhold Meta connect controls", () => {
  const plans = loadAction("lib/plans.ts", {});
  const rules = loadAction("lib/entitlement-rules.ts", { "@/lib/plans": plans });
  const future = "2026-12-20T00:00:00Z";
  const now = new Date("2026-11-20T00:00:00Z");
  const trial = rules.entitlementFromRow({ plan_key: "starter", status: "trialing", trial_ends_at: future }, now, rules.entitlementConfigFromEnv({}));
  const starter = rules.entitlementFromRow({ plan_key: "starter", status: "active", current_period_end: future }, now, rules.entitlementConfigFromEnv({}));
  assert.equal(rules.channelAllowed(trial, "whatsapp"), true);
  assert.equal(rules.channelAllowed({ ...trial, channels: rules.applyLaunchSwitches(trial.channels, { whatsapp: false, instagram: true }) }, "whatsapp"), false);
  assert.equal(rules.channelAllowed(starter, "whatsapp"), false);
  assert.equal(rules.channelAllowed(starter, "instagram"), false);
  assert.match(source(onboarding + "page.tsx"), /channelAllowed\(entitlement, "whatsapp"\) \? getEmbeddedSignupClientConfig/);
  assert.match(source(steps + "channels-step.tsx"), /!whatsappEntitled[\s\S]*?ChannelUpgradeNotice[\s\S]*?EmbeddedSignupButton/);
  assert.match(source(steps + "channels-step.tsx"), /!instagramEntitled[\s\S]*?ChannelUpgradeNotice[\s\S]*?ConnectInstagramButton/);
});

test("catalog placeholders use industry examples and business currency", () => {
  const { catalogPlaceholders } = loadAction("lib/catalog-placeholders.ts", {
    "@/lib/currency": loadAction("lib/currency.ts", {}),
  });
  assert.equal(catalogPlaceholders("healthcare", "INR", "service").price, "₹6,500");
  assert.equal(catalogPlaceholders("real_estate", "INR", "product").price, "₹78 lakh");
  assert.match(catalogPlaceholders("healthcare", "USD", "service").price, /\$/);
  assert.match(catalogPlaceholders("education", "USD", "service").name, /Python course/);
  assert.match(catalogPlaceholders("ecommerce", "INR", "product").name, /Linen/);
  assert.match(catalogPlaceholders("other", "USD", "service").name, /consultation/);
});

test("wizard wiring covers organization branding, profile defaults, training cards, and sequential personality saves", () => {
  assert.match(source("app/(dashboard)/layout.tsx"), /taskChooseOrganization:[\s\S]*?What's your business called/);
  const page = source(onboarding + "page.tsx");
  assert.match(page, /initialName=\{organization.name\} initialEmail=\{user\?\.primaryEmailAddress/);
  const profile = source(steps + "business-step.tsx");
  assert.match(profile, /aria-pressed=\{businessType === type.value\}/);
  assert.match(profile, /descriptionOk \? .*characters.* : .*Minimum/);
  assert.match(profile, /WeeklyHoursFields week=\{week\}/);
  const knowledge = source(dashboard + "knowledge/_components/knowledge-list.tsx");
  assert.match(knowledge, /agentPublished \? "Live" : "Ready"/);
  assert.match(knowledge, /stacked \? \([\s\S]*?<ul className="flex min-w-0[\s\S]*?<DataTable/);
  assert.match(knowledge, /documents ready.*waiting for review/);
  assert.match(source(steps + "train-products-step.tsx"), /offerings = \[\.\.\.products, \.\.\.services\]/);
  assert.match(source(dashboard + "products/product-form.tsx"), /onboardingPlaceholders \? \([\s\S]*?Advanced<\/summary/);
  assert.doesNotMatch(source(steps + "train-faqs-step.tsx"), /key=\{draftQuestion\}/);
  assert.match(source(steps + "train-faqs-step.tsx"), /aria-label="Added"/);
  assert.match(source(dashboard + "faqs/faq-form.tsx"), /type="submit"\s+disabled=\{isPending\}/);
  const persona = source(steps + "persona-step.tsx");
  assert.match(persona, /DEFAULT_WIDGET_PRIMARY, (?:"#[a-f0-9]{6}", ){6}"#[a-f0-9]{6}"/);
  assert.match(persona, /await updateWidgetBrandingAction[\s\S]*?await updateAiCapabilitiesAction[\s\S]*?await advanceOnboarding/);
  assert.match(persona, /Uses your business hours: \{hoursSummary\}/);
});

test("wizard wiring uses saved key, timed trial confirmation, and shared readiness counts", () => {
  const channels = source(steps + "channels-step.tsx");
  assert.match(channels, /primaryKey \? <WidgetInstallGuide/);
  assert.match(channels, /add my website later/);
  assert.match(channels, /Your website address/);
  assert.match(source(steps + "plan-step.tsx"), /animate-spin[\s\S]*?Setting up your trial/);
  assert.match(source(onboarding + "actions.ts"), /onboarding_trial_timing.*\{ step, durationMs:/);
  const page = source(onboarding + "page.tsx");
  assert.match(page, /Free trial · ends \$\{trialEnd\} · \$\{quota.repliesUsed\} of/);
  assert.match(page, /completion\[step\] && stepIndexAllowed\(step, business.onboarding_step\)/);
  assert.match(source("lib/onboarding-steps.ts"), /ONBOARDING_READINESS_TOTAL = 11/);
  assert.match(source(onboarding + "_components/preview-context.tsx"), /if \(local.seedKey !== seedKey\)/);
  assert.match(source(onboarding + "_components/preview-panel.tsx"), /preview.published \? "Live" : "Draft"/);
  const review = source(steps + "review-step.tsx");
  assert.match(review, /ReadinessCounts counts=\{counts\}/);
  assert.match(review, /privacyPolicyFieldHref="#rd-privacy"/);
  assert.match(source(dashboard + "_components/sandbox-chat/actions.ts"), /response.sandboxBooking[\s\S]*?Test booking — nothing was saved and no one was notified/);
});
