import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createLoaderHarness, jsonResponse, sseResponse } from "./lib/widget-loader-harness.mjs";

// perf/reply-and-save-speed (STATE.md 2026-11-21). Mocks only -- no network,
// database or Gemini.

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

function loadModule(path, mocks = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports, URL, console, process, Promise, Symbol, Date, Math, JSON, Set, Map, Error, setTimeout, clearTimeout,
    globalThis: globals.globalThis ?? {},
    ...globals,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "zod") return require(name);
      if (name === "server-only") return {};
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return exports;
}

// ------------------------------------------------------- item 4: timing logs
function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms) => (now += ms) };
}

test("request_timing: one line with only the fixed, identifier-free fields", () => {
  const { RequestTiming } = loadModule("lib/request-timing.ts", {}, { globalThis: {} });
  const clock = fakeClock();
  const lines = [];
  const timing = new RequestTiming("onboarding_advance", { now: clock.now, write: (line) => lines.push(line) });
  clock.advance(40);
  timing.mark("auth");
  clock.advance(60);
  const log = timing.finish("ok");
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(parsed).sort(), ["at", "cold", "event", "instanceAgeMs", "name", "outcome", "processUptimeMs", "stages", "totalMs"]);
  assert.equal(parsed.event, "request_timing");
  assert.equal(parsed.at, new Date(1_000).toISOString()); // its own timestamp: PM2 log files carry no platform time
  assert.equal(parsed.totalMs, 100);
  assert.deepEqual(parsed.stages, [{ stage: "at_auth", ms: 40 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), parsed); // the vm realm has its own Object prototype
  // A second finish never writes a second line.
  assert.equal(timing.finish("error"), null);
  assert.equal(lines.length, 1);
});

test("request_timing: names that are not code literals (ids, emails, text) are replaced", () => {
  const { RequestTiming } = loadModule("lib/request-timing.ts", {}, { globalThis: {} });
  const lines = [];
  const timing = new RequestTiming("a@b.co", { write: (line) => lines.push(line) });
  timing.mark("ab558cec-e761-4c1f-9a2e-123456789abc");
  timing.mark("Hello there");
  timing.finish("ok");
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.name, "invalid");
  assert.ok(parsed.stages.every((stage) => /^[a-z][a-z0-9_]*$/.test(stage.stage)));
  assert.doesNotMatch(lines[0], /@|ab558cec|Hello/);
});

test("request_timing: the first request on an instance is cold, later ones are not, across module copies", () => {
  const shared = {};
  const first = loadModule("lib/request-timing.ts", {}, { globalThis: shared });
  const second = loadModule("lib/request-timing.ts", {}, { globalThis: shared }); // another route bundle
  const clock = fakeClock(5_000);
  first.markInstanceStart(4_000);
  const a = new first.RequestTiming("api_chat", { now: clock.now, write: () => {} }).finish("ok");
  const b = new second.RequestTiming("api_chat", { now: clock.now, write: () => {} }).finish("ok");
  assert.equal(a.cold, true);
  assert.equal(b.cold, false);
  assert.equal(a.instanceAgeMs, 1_000);
});

test("request_timing: a quiet hot path logs only when cold or slow", () => {
  const shared = {};
  const { RequestTiming } = loadModule("lib/request-timing.ts", {}, { globalThis: shared });
  const clock = fakeClock();
  const lines = [];
  const opts = { now: clock.now, write: (line) => lines.push(line) };
  assert.ok(new RequestTiming("dashboard_poll", opts).finish("ok", { onlyIfSlowerThanMs: 1_000 })); // cold: logged
  assert.equal(new RequestTiming("dashboard_poll", opts).finish("ok", { onlyIfSlowerThanMs: 1_000 }), null); // warm + fast
  const slow = new RequestTiming("dashboard_poll", opts);
  clock.advance(1_500);
  assert.ok(slow.finish("ok", { onlyIfSlowerThanMs: 1_000 }));
  assert.equal(lines.length, 2);
});

test("withRequestTiming: a redirect is logged as redirect and rethrown unchanged", async () => {
  const { withRequestTiming } = loadModule("lib/request-timing.ts", {}, { globalThis: {} });
  const lines = [];
  const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/onboarding?step=channels;307;" });
  await assert.rejects(
    withRequestTiming("onboarding_persona", async () => { throw redirectError; }, undefined, { write: (line) => lines.push(line) }),
    (error) => error === redirectError,
  );
  assert.equal(JSON.parse(lines[0]).outcome, "redirect");
  const failure = new Error("boom");
  await assert.rejects(withRequestTiming("x", async () => { throw failure; }, undefined, { write: (line) => lines.push(line) }));
  assert.equal(JSON.parse(lines[1]).outcome, "error");
});

test("timing is wired into every slow path, with fixed names", () => {
  const wiring = [
    ["app/api/chat/route.ts", /new RequestTiming\("api_chat"\)/],
    ["app/api/chat/route.ts", /timing\.mark\("first_delta"\)/],
    ["app/(dashboard)/dashboard/_components/sandbox-chat/actions.ts", /withRequestTiming\(\s*"sandbox_chat"/],
    ["app/(dashboard)/onboarding/actions.ts", /withRequestTiming\(\s*"onboarding_create_business"/],
    ["app/(dashboard)/onboarding/actions.ts", /withRequestTiming\(\s*"onboarding_advance"/],
    ["app/(dashboard)/onboarding/page.tsx", /withRequestTiming\("onboarding_render"/],
    ["app/(dashboard)/dashboard/products/actions.ts", /withRequestTiming\(\s*"catalog_create_product"/],
    ["app/(dashboard)/dashboard/services/actions.ts", /withRequestTiming\(\s*"catalog_create_service"/],
    ["app/(dashboard)/dashboard/faqs/actions.ts", /withRequestTiming\(\s*"catalog_create_faq"/],
    ["instrumentation.ts", /markInstanceStart\(\)/],
    ["lib/rag.ts", /timer\.record\("at_first_model_text"/],
    ["lib/rag.ts", /timer\.record\("at_first_visible_text"/],
  ];
  for (const [file, pattern] of wiring) assert.match(source(file), pattern, file);
  // The old trial-only console line is gone (it was replaced, not duplicated).
  assert.doesNotMatch(source("app/(dashboard)/onboarding/actions.ts"), /onboarding_trial_timing/);
});

test("the SSE stream reports each written event to onEvent, and a throwing observer cannot break it", async () => {
  const { createChatSseStream } = loadModule("lib/chat-sse-response.ts", {
    "@/lib/chat-stream": { encodeStreamEvent: (event) => `data: ${JSON.stringify(event)}\n\n` },
  }, { TextEncoder, TextDecoder, ReadableStream, AbortController, setInterval, clearInterval });
  const seen = [];
  const stream = createChatSseStream({
    meta: { conversationId: "c", asOf: null },
    async *generate() {
      yield { kind: "delta", text: "Hello. " };
      yield { kind: "delta", text: "Bye." };
      yield { kind: "final", response: { escalate: false, recommendedProducts: [] }, interrupted: false };
    },
    persist: async () => ({ asOf: "t" }),
    sideEffects: async () => {},
    logError: () => {},
    onEvent: (type) => {
      seen.push(type);
      throw new Error("observer bug");
    },
    keepAliveMs: 10_000,
    watchdogMs: 10_000,
  });
  const text = await new Response(stream).text();
  assert.deepEqual(seen, ["meta", "delta", "delta", "final"]);
  assert.match(text, /"type":"final"/);
});

// ------------------------------------------- item 1: one request per click
const STEPS = ["account", "verify", "business", "knowledge", "products", "faqs", "persona", "channels", "plan", "review", "live"];

function loadOnboardingActions({ currentStep = "persona", savedStep = "faqs", branding, capabilities, profile } = {}) {
  const calls = [];
  const redirectTo = (path) => {
    calls.push(["redirect", path]);
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${path};307;` });
  };
  const mod = loadModule("app/(dashboard)/onboarding/actions.ts", {
    "next/cache": { revalidatePath: (path) => calls.push(["revalidate", path]) },
    "next/navigation": { redirect: redirectTo },
    "next/server": { after: () => {} },
    "@/lib/clerk-org-name": { syncClerkOrganizationName: async () => {} },
    "@/lib/auth": { requireAuthContext: async () => ({ userId: "u", orgId: "org-a", orgRole: "org:admin" }), requireMinRole: () => null },
    "@/lib/business-context": { requireBusinessContext: async () => ({ businessId: "b", orgId: "org-a", orgRole: "org:admin" }) },
    "@/lib/business": {
      getBusinessForOrg: async () => ({ id: "b", onboarding_step: savedStep }),
      saveOnboardingStep: async (_org, step) => calls.push(["save_step", step]),
    },
    "@/lib/onboarding-steps": {
      ONBOARDING_STEPS: STEPS,
      computeOnboardingProgress: async () => ({ currentStep }),
    },
    "@/lib/schemas/business": {},
    "@/lib/schemas/weekly-hours": {},
    "@/lib/schemas/onboarding-website": {},
    "@/lib/timezones": {},
    "@/lib/currency": {},
    "@/lib/errors": { logAndGetUserMessage: () => "Something went wrong." },
    "@/lib/widget-keys": {},
    "@/lib/audit-log": { recordAuditLogEntry: async () => {} },
    "@/lib/request-timing": loadModule("lib/request-timing.ts", {}, { globalThis: {} }),
    "../dashboard/profile/actions": {
      updateBusinessProfileAction: async () => { calls.push(["profile"]); return profile ?? { success: true }; },
    },
    "../dashboard/widget-settings/actions": {
      updateWidgetBrandingAction: async () => { calls.push(["branding"]); return branding ?? { success: true }; },
      updateAiCapabilitiesAction: async (_prev, fields) => {
        calls.push(["capabilities", [...fields.keys()].sort().join(",")]);
        return capabilities ?? { success: true };
      },
    },
  }, { FormData, globalThis: {} });
  return { ...mod, calls };
}

const isRedirect = (path) => (error) => typeof error.digest === "string" && error.digest.includes(`;${path};`);

// The vm's console.log would print each timing line; keep test output clean.
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

test("continueOnboarding: a reached step saves and redirects in the same request", async () => {
  const { continueOnboarding, calls } = loadOnboardingActions({ currentStep: "persona", savedStep: "faqs" });
  await quiet(() => assert.rejects(continueOnboarding("persona"), isRedirect("/onboarding?step=persona")));
  assert.deepEqual(calls.map((c) => c[0]), ["save_step", "revalidate", "redirect"]);
});

test("continueOnboarding: a step not yet reached, an unknown step and live are refused without a redirect", async () => {
  for (const step of ["channels", "bogus", "live"]) {
    const { continueOnboarding, calls } = loadOnboardingActions({ currentStep: "persona" });
    const result = await quiet(() => continueOnboarding(step));
    assert.equal(result.ok, false, step);
    assert.ok(!calls.some((c) => c[0] === "redirect" || c[0] === "save_step"), step);
  }
});

test("savePersonaStepAction: branding, then capabilities, then the step, then Channels -- one request", async () => {
  const { savePersonaStepAction, calls } = loadOnboardingActions({ currentStep: "channels", savedStep: "persona" });
  const form = new FormData();
  for (const [key, value] of [["welcomeText", "Hi"], ["appointmentsEnabled", "on"], ["appointmentSlotMinutes", "30"], ["accentColor", "#3f3f46"]]) form.set(key, value);
  await quiet(() => assert.rejects(savePersonaStepAction({}, form), isRedirect("/onboarding?step=channels")));
  assert.deepEqual(calls.map((c) => c[0]), ["branding", "capabilities", "save_step", "revalidate", "redirect"]);
  // Capabilities get exactly the fields the browser used to send them.
  assert.equal(calls[1][1], "appointmentSlotMinutes,appointmentsEnabled");
});

test("savePersonaStepAction: the first failure is returned and nothing after it runs", async () => {
  const brandingFails = loadOnboardingActions({ branding: { error: "Enter a six-digit hex colour." } });
  assert.deepEqual(await quiet(() => brandingFails.savePersonaStepAction({}, new FormData())), { error: "Enter a six-digit hex colour." });
  assert.deepEqual(brandingFails.calls.map((c) => c[0]), ["branding"]);

  const capabilitiesFail = loadOnboardingActions({ capabilities: { error: "Slot length must be…" } });
  await quiet(() => capabilitiesFail.savePersonaStepAction({}, new FormData()));
  assert.deepEqual(capabilitiesFail.calls.map((c) => c[0]), ["branding", "capabilities"]);

  const stepRefused = loadOnboardingActions({ currentStep: "faqs" });
  const refused = await quiet(() => stepRefused.savePersonaStepAction({}, new FormData()));
  assert.match(refused.error, /Finish the "faqs" step first/);
  assert.ok(!stepRefused.calls.some((c) => c[0] === "redirect"));
});

test("saveBusinessStepAction: a saved profile goes straight to Train; a rejected one stays", async () => {
  const ok = loadOnboardingActions();
  await quiet(() => assert.rejects(ok.saveBusinessStepAction({}, new FormData()), isRedirect("/onboarding?step=knowledge")));
  const bad = loadOnboardingActions({ profile: { error: "Fix the highlighted fields below.", fieldErrors: { name: "Required" } } });
  const state = await quiet(() => bad.saveBusinessStepAction({}, new FormData()));
  assert.equal(state.error, "Fix the highlighted fields below.");
  assert.ok(!bad.calls.some((c) => c[0] === "redirect"));
});

test("no wizard step makes a second request after Continue", () => {
  const steps = "app/(dashboard)/onboarding/_components/steps/";
  for (const [file, next] of [
    ["train-knowledge-step.tsx", "products"], ["train-products-step.tsx", "faqs"], ["train-faqs-step.tsx", "persona"],
    ["channels-step.tsx", "plan"], ["plan-step.tsx", "review"],
  ]) {
    const text = source(steps + file);
    assert.ok(text.includes(`continueOnboarding("${next}")`), file);
    assert.doesNotMatch(text, /advanceOnboarding/, file);
    assert.ok(!text.includes(`router.push("/onboarding?step=${next}")`), file);
  }
  const persona = source(steps + "persona-step.tsx");
  assert.match(persona, /useActionState\(savePersonaStepAction/);
  assert.doesNotMatch(persona, /router\.push\("\/onboarding\?step=channels"\)/);
  const business = source(steps + "business-step.tsx");
  assert.match(business, /useActionState\(\s*saveBusinessStepAction/);
  assert.doesNotMatch(business, /router\.push\("\/onboarding\?step=knowledge"\)/);
});

// --------------------------- item 3: polls off the Server Action queue
test("poll cadence: 1 s while things changed in the last 30 s, then 5 s", () => {
  const { nextPollDelayMs, POLL_FAST_MS, POLL_SLOW_MS } = loadModule("lib/poll-cadence.ts");
  assert.equal(POLL_FAST_MS, 1_000);
  assert.equal(POLL_SLOW_MS, 5_000);
  assert.equal(nextPollDelayMs(0, 0), 1_000);
  assert.equal(nextPollDelayMs(0, 29_999), 1_000);
  assert.equal(nextPollDelayMs(0, 30_000), 5_000);
  assert.equal(nextPollDelayMs(0, 600_000), 5_000);
});

function loadBusinessContext({ session, business }) {
  return loadModule("lib/business-context.ts", {
    "next/navigation": { redirect: (path) => { throw new Error("redirect " + path); } },
    "@clerk/nextjs/server": { auth: async () => session },
    "@/lib/auth": { requireAuthContext: async () => session },
    "@/lib/business": { getBusinessForOrg: async (orgId) => (business && orgId === "org-a" ? business : null) },
    "@/lib/agent-published": { isAgentPublished: () => true },
    "@/lib/business-lifecycle": loadModule("lib/business-lifecycle.ts", { "@/lib/agent-published": { isAgentPublished: () => true } }),
  });
}

const tenantA = { id: "business-a", name: "A", contact_email: null, timezone: "Asia/Kolkata", currency: "INR", status: "active", deleted_at: null };

test("route context: business only from the Clerk session; signed-out, org-less and suspended get null", async () => {
  const ok = await loadBusinessContext({ session: { userId: "u", orgId: "org-a", orgRole: "org:member" }, business: tenantA }).getBusinessContextForRoute();
  assert.equal(ok.businessId, "business-a");
  for (const [session, business] of [
    [{ userId: null, orgId: null }, tenantA],
    [{ userId: "u", orgId: null }, tenantA],
    [{ userId: "u", orgId: "org-b" }, tenantA],
    [{ userId: "u", orgId: "org-a" }, { ...tenantA, status: "suspended" }],
    [{ userId: "u", orgId: "org-a" }, { ...tenantA, deleted_at: "2026-11-01T00:00:00Z" }],
  ]) {
    assert.equal(await loadBusinessContext({ session, business }).getBusinessContextForRoute(), null);
  }
});

function loadRoute(path, { context, loaders }) {
  const seen = [];
  const mod = loadModule(path, {
    "next/server": {
      NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }) },
    },
    "@/lib/business-context": { getBusinessContextForRoute: async () => context },
    "@/lib/dashboard-poll": {
      loadAttentionSnapshot: async (businessId) => { seen.push(["attention", businessId]); return loaders.attention; },
      loadConversationUpdates: async (businessId, input) => { seen.push(["updates", businessId, input]); return loaders.updates; },
      loadConversationList: async (businessId) => { seen.push(["list", businessId]); return loaders.list; },
    },
    "@/lib/errors": { logAndGetUserMessage: () => "x" },
    "@/lib/request-timing": { RequestTiming: class { time(_s, w) { return w(); } finish() { return null; } } },
  });
  return { ...mod, seen };
}

test("GET /api/dashboard/attention: 401 without a session business; counts for the session's own business, never cached", async () => {
  const denied = loadRoute("app/api/dashboard/attention/route.ts", { context: null, loaders: {} });
  const refused = await denied.GET();
  assert.equal(refused.status, 401);
  assert.equal(denied.seen.length, 0);

  const route = loadRoute("app/api/dashboard/attention/route.ts", {
    context: { businessId: "business-a" },
    loaders: { attention: { attentionCount: 2, unreadNotificationCount: 5 } },
  });
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.body.attentionCount, 2);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(route.seen, [["attention", "business-a"]]);
});

test("GET conversation updates: session business only; another tenant's or a bad id gets the old empty answer", async () => {
  const request = { nextUrl: new URL("https://x.test/api/dashboard/conversations/c1/updates?after=2026-11-21T10:00:00.000Z&businessId=business-b") };
  const params = { params: Promise.resolve({ id: "c1" }) };
  const denied = loadRoute("app/api/dashboard/conversations/[id]/updates/route.ts", { context: null, loaders: {} });
  assert.equal((await denied.GET(request, params)).status, 401);

  const foreign = loadRoute("app/api/dashboard/conversations/[id]/updates/route.ts", {
    context: { businessId: "business-a" },
    loaders: { updates: null }, // loadConversationUpdates found no conversation of business-a with this id
  });
  const empty = await foreign.GET(request, params);
  assert.equal(empty.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.body)), { messages: [], control: "ai", needsAttention: false, asOf: "2026-11-21T10:00:00.000Z" });
  // The business id in the query string is ignored; the session's is used.
  assert.equal(foreign.seen[0][1], "business-a");
  assert.equal(foreign.seen[0][2].conversationId, "c1");
});

test("the attention badge and the open conversation poll with fetch, not a Server Action", () => {
  const provider = source("app/(dashboard)/dashboard/_components/attention-provider.tsx");
  const panel = source("app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx");
  for (const text of [provider, panel]) {
    assert.doesNotMatch(text, /from "\.\.\/actions"|from "\.\.\/\.\.\/actions"/);
    assert.match(text, /nextPollDelayMs\(lastChangeAtRef\.current, Date\.now\(\)\)/);
    assert.match(text, /visibilityState === "visible"/); // still pauses while hidden
  }
  assert.match(provider, /fetchAttentionSnapshot\(\)/);
  assert.match(panel, /fetchConversationUpdates\(conversationId, asOfRef\.current\)/);
  assert.match(source("lib/dashboard-poll-client.ts"), /cache: "no-store"/);
});

// --------------------------------------- item 2: lighter onboarding render
function readinessHarness() {
  const reads = [];
  const rows = {
    knowledge_documents: [
      { id: "d1", source_type: "faq", source_id: "faq-1", ingestion_status: "complete", status: "published" },
      { id: "d2", source_type: "faq", source_id: "faq-2", ingestion_status: "processing", status: "published" },
      { id: "d3", source_type: "manual", source_id: null, ingestion_status: "complete", status: "published" },
    ],
    knowledge_chunks: [{ document_id: "d1" }, { document_id: "d3" }],
    business_readiness_dismissals: [],
  };
  const query = (table) => {
    const result = { data: rows[table], error: null };
    const builder = { select: () => builder, eq: () => builder, then: (resolve) => resolve(result) };
    return builder;
  };
  const list = (name, value) => async () => { reads.push(name); return value; };
  const mod = loadModule("lib/onboarding-readiness-data.ts", {
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({ from: (table) => { reads.push(table); return query(table); } }) },
    "@/lib/errors": { AppError: Error },
    "@/lib/faqs": { listFaqsForBusiness: list("faqs", [{ id: "faq-1", question: "Q1?", answer: "A1" }]) },
    "@/lib/products": { listProductsForBusiness: list("products", [{ name: "Whitening", description: "Teeth whitening" }]) },
    "@/lib/services": { listServicesForBusiness: list("services", []) },
    "@/lib/business-hours": { listBusinessHours: list("business_hours", [{ is_open: true }]) },
    "@/lib/business-hours-defaults": { hasConfirmedBusinessHours: () => true },
    "@/lib/agent-published": { isAgentPublished: () => false },
    "@/lib/onboarding-readiness": { evaluateReadiness: (input) => ({ items: [], canPublish: true, input }) },
  });
  return { ...mod, reads };
}

test("loadReadinessData: the same seven reads, and it also returns the rows the page renders", async () => {
  const harness = readinessHarness();
  const data = await harness.loadReadinessData("business-a", { business_type: "clinic" });
  assert.equal(harness.reads.length, 7);
  assert.deepEqual([...harness.reads].sort(), ["business_hours", "business_readiness_dismissals", "faqs", "knowledge_chunks", "knowledge_documents", "products", "services"]);
  assert.equal(data.products[0].name, "Whitening");
  assert.equal(data.hours.length, 1);
  // Same answer getFaqGeneratedDocStatuses gave from its own extra query.
  assert.deepEqual(JSON.parse(JSON.stringify(data.faqDocStatuses)), { "faq-1": "complete", "faq-2": "processing" });
  assert.deepEqual(data.report.input.knowledgeSources.map((s) => s.hasChunks), [true, false, true]);
});

test("onboardingProgressFrom grades exactly like computeOnboardingProgress", async () => {
  const report = (met, canPublish) => ({ items: met.map((key) => ({ key, status: "met" })), canPublish });
  const cases = [
    [report([], false), { serving: false }, null, null, []],
    [report(["profile_name", "profile_business_type", "profile_description", "profile_contact_email", "knowledge_ready"], false), { serving: true }, null, null, [{ status: "revoked" }]],
    [report(["profile_name", "profile_business_type", "profile_description", "profile_contact_email", "knowledge_ready", "catalog_present", "faqs_ready"], true), { serving: true }, { id: "wa" }, null, [{ status: "active" }]],
  ];
  for (const [rep, entitlement, whatsapp, instagram, widgetKeys] of cases) {
    const steps = loadModule("lib/onboarding-steps.ts", {
      "@/lib/onboarding-readiness-data": { loadReadinessReport: async () => rep },
      "@/lib/subscription": { getEntitlementForBusiness: async () => entitlement },
      "@/lib/whatsapp": { getWhatsappConnectionForBusiness: async () => whatsapp },
      "@/lib/instagram": { getInstagramConnectionForBusiness: async () => instagram },
      "@/lib/widget-keys": { listWidgetKeysForBusiness: async () => widgetKeys },
      "@/lib/agent-published": { isAgentPublished: () => false },
    });
    const business = { id: "b", widget_welcome_text: "Hi", widget_language: "en" };
    const viaLoad = await steps.computeOnboardingProgress(business);
    const viaRows = steps.onboardingProgressFrom(business, { report: rep, entitlement, whatsapp, instagram, widgetKeys });
    assert.deepEqual(JSON.parse(JSON.stringify(viaRows)), JSON.parse(JSON.stringify(viaLoad)));
  }
});

test("the onboarding page loads its data once: no duplicate progress, readiness, list or hours reads", () => {
  const page = source("app/(dashboard)/onboarding/page.tsx");
  assert.match(page, /loadReadinessData\(businessId, business\)/);
  assert.match(page, /onboardingProgressFrom\(business, \{ report: readiness/);
  for (const duplicate of [/computeOnboardingProgress\(/, /loadReadinessReport\(/, /getFaqGeneratedDocStatuses\(/, /listBusinessHours\(/, /listProductsForBusiness\(/, /listServicesForBusiness\(/, /listFaqsForBusiness\(/]) {
    assert.doesNotMatch(page, duplicate);
  }
  assert.equal((page.match(/await Promise\.all\(/g) ?? []).length, 3); // the load, plus the existing new-business and plan-step pairs
});

// ---------------------- item 7: product/service embeddings after the response
test("writeCatalogEmbedding: tenant-scoped, only onto the saved version, never throws", async () => {
  const { writeCatalogEmbedding } = loadModule("lib/catalog-embedding.ts", {
    "@/lib/supabase/service": {}, "@/lib/embeddings": {}, "@/lib/logger": {},
  });
  const run = async (overrides = {}) => {
    const events = [];
    const updates = [];
    const deps = {
      embed: async () => [0.1, 0.2],
      update: async (...args) => { updates.push(args); return { updated: true, failed: false }; },
      log: (event, businessId, level) => events.push([event, businessId, level]),
      ...overrides,
    };
    await writeCatalogEmbedding("products", "business-a", "p1", "2026-11-21T10:00:00.123456+00:00", "Whitening", deps);
    return { events, updates };
  };
  const ok = await run();
  assert.deepEqual(JSON.parse(JSON.stringify(ok.updates)), [["products", "business-a", "p1", "2026-11-21T10:00:00.123456+00:00", [0.1, 0.2]]]);
  assert.equal(ok.events.length, 0);

  const superseded = await run({ update: async () => ({ updated: false, failed: false }) });
  assert.deepEqual(superseded.events, [["product_embedding_superseded", "business-a", "info"]]);

  const embedFails = await run({ embed: async () => { throw new Error("429"); } });
  assert.equal(embedFails.updates.length, 0);
  assert.deepEqual(embedFails.events, [["product_embedding_failed", "business-a", "error"]]);

  const writeThrows = await run({ update: async () => { throw new Error("network"); } });
  assert.deepEqual(writeThrows.events, [["product_embedding_write_failed", "business-a", "error"]]);
});

function loadCatalogService(file, { embedCalls }) {
  const inserts = [];
  const order = [];
  const builder = () => {
    const api = {
      insert: (row) => { inserts.push(row); order.push("insert"); return api; },
      select: () => api,
      single: async () => ({ data: { id: "new-id", name: "Whitening", updated_at: "2026-11-21T10:00:00.5+00:00", ...inserts.at(-1) }, error: null }),
    };
    return api;
  };
  const mod = loadModule(file, {
    "@/lib/agent-images": { cleanupAgentImage: async () => {} },
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({ from: builder }) },
    "@/lib/errors": { AppError: Error },
    "@/lib/knowledge-sync": { syncGeneratedDocument: async () => { order.push("sync"); }, deleteGeneratedDocument: async () => {} },
    "@/lib/embeddings": { embedText: async () => { embedCalls.push("inline"); order.push("embed"); return [1, 2, 3]; } },
    "@/lib/logger": { logEvent: () => {} },
    "@/lib/currency": { formatCatalogPrice: (price) => price },
    "@/lib/catalog-embedding": { writeCatalogEmbedding: async (...args) => { embedCalls.push(["deferred", ...args]); } },
  });
  return { ...mod, inserts, order };
}

test("createProduct/createService with embedLater: saved and answered without waiting for Gemini; embedded afterwards", async () => {
  for (const [file, fn, table] of [["lib/products.ts", "createProduct", "products"], ["lib/services.ts", "createService", "services"]]) {
    const embedCalls = [];
    const svc = loadCatalogService(file, { embedCalls });
    const later = [];
    const input = { name: "Whitening", description: "Teeth whitening in one visit", price: "3000", image_url: null, category: null, price_amount: 3000 };
    await svc[fn]("business-a", input, "INR", undefined, { embedLater: (task) => later.push(task) });
    assert.deepEqual(svc.order, ["insert", "sync"], file); // no Gemini call before the answer
    assert.equal(svc.inserts[0].embedding, null, file);
    assert.equal(svc.inserts[0].business_id, "business-a", file);
    assert.equal(later.length, 1, file);
    await later[0]();
    const [kind, deferredTable, businessId, id, updatedAt] = embedCalls[0];
    assert.deepEqual([kind, deferredTable, businessId, id, updatedAt], ["deferred", table, "business-a", "new-id", "2026-11-21T10:00:00.5+00:00"], file);

    // Without embedLater (website-suggestion approval, any other caller) it embeds inline as before.
    const inlineCalls = [];
    const inline = loadCatalogService(file, { embedCalls: inlineCalls });
    await inline[fn]("business-a", input, "INR");
    assert.deepEqual(inline.order, ["embed", "insert", "sync"], file);
    assert.deepEqual(JSON.parse(JSON.stringify(inline.inserts[0].embedding)), [1, 2, 3], file);
  }
});

test("the dashboard and onboarding catalog actions defer embeddings with after()", () => {
  const products = source("app/(dashboard)/dashboard/products/actions.ts");
  const services = source("app/(dashboard)/dashboard/services/actions.ts");
  assert.equal((products.match(/\{ embedLater: after \}/g) ?? []).length, 3); // create, update, in-place update
  assert.equal((services.match(/\{ embedLater: after \}/g) ?? []).length, 2); // create, update
});

// ----------------------- item 5: the widget turn ends when the text ends
test("the server waits at most 0.3 s for the judgement after the text, and says when it is still pending", async () => {
  assert.match(source("lib/chat-timeouts.ts"), /export const STREAM_METADATA_GRACE_MS = 300;/);
  const { createChatSseStream } = loadModule("lib/chat-sse-response.ts", {
    "@/lib/chat-stream": { encodeStreamEvent: (event) => `data: ${JSON.stringify(event)}\n\n` },
  }, { TextEncoder, TextDecoder, ReadableStream, AbortController, setInterval, clearInterval });
  const finalOf = async (pending) => {
    const stream = createChatSseStream({
      meta: { conversationId: "c", asOf: "2026-11-21T10:00:00.000Z" },
      async *generate() {
        yield { kind: "delta", text: "Our team can help with that." };
        yield { kind: "final", response: { escalate: false, recommendedProducts: [], pendingJudgement: pending }, interrupted: false };
      },
      persist: async () => ({ asOf: "2026-11-21T10:00:01.000Z" }),
      finalExtras: async (response) => ({ followUpContact: null, judgementPending: Boolean(response.pendingJudgement) }),
      sideEffects: async () => {},
      logError: () => {},
      keepAliveMs: 10_000,
      watchdogMs: 10_000,
    });
    const text = await new Response(stream).text();
    return JSON.parse(text.split("\n\n").filter(Boolean).at(-1).slice(6));
  };
  assert.equal((await finalOf(Promise.resolve(null))).judgementPending, true);
  assert.equal((await finalOf(undefined)).judgementPending, false);
  assert.match(source("app/api/chat/route.ts"), /judgementPending: Boolean\(response\.pendingJudgement\)/);
});

const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const TURN_STARTED = "2026-11-21T10:00:00.000Z";

function lateJudgementHarness(pollData) {
  const sse = sseResponse();
  const h = createLoaderHarness({
    fetchHandler: (r) =>
      r.path === "/api/chat"
        ? sse.response
        : r.path === "/api/chat/poll"
          ? jsonResponse({ ok: true, data: { conversationId: CONVERSATION, control: "ai", messages: [], asOf: TURN_STARTED, ...pollData() } })
          : undefined,
  });
  return { h, sse };
}

async function finishPendingTurn({ h, sse }) {
  h.fromIframe({ type: "widget:ready" });
  h.fromIframe({ type: "widget:panel_open", open: true });
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "Can someone call me about whitening?", consentGiven: true });
  await h.flush();
  sse.push({ type: "meta", conversationId: CONVERSATION, asOf: TURN_STARTED });
  sse.push({ type: "delta", text: "Teeth whitening is 3,000 rupees." });
  sse.push({ type: "final", escalate: false, recommendedProducts: [], asOf: "2026-11-21T10:00:02.000Z", followUpContact: null, judgementPending: true });
  sse.end();
  await h.flush();
}

test("late escalation: the existing widget poll shows the banner on that turn's reply", async () => {
  let flagged = false;
  const harness = lateJudgementHarness(() =>
    flagged
      ? { needsAttention: true, attentionFlaggedAt: "2026-11-21T10:00:03.500Z", followUpContact: "+91 98•••••210" }
      : { needsAttention: false, attentionFlaggedAt: null, followUpContact: null },
  );
  await finishPendingTurn(harness);
  const { h } = harness;
  const [end] = h.postedOfType("widget:stream_end");
  assert.equal(end.judgementPending, true, "the turn ended with its text; the judgement is still running");
  assert.equal(h.postedOfType("widget:late_escalation").length, 0);
  await h.advance(2_500); // first fast poll: not escalated yet
  assert.equal(h.postedOfType("widget:late_escalation").length, 0);
  flagged = true; // the background judgement escalated and flagged the conversation
  await h.advance(2_500);
  const late = h.postedOfType("widget:late_escalation");
  assert.equal(late.length, 1);
  assert.equal(late[0].requestId, "r1");
  assert.equal(late[0].followUpContact, "+91 98•••••210");
  await h.advance(10_000);
  assert.equal(h.postedOfType("widget:late_escalation").length, 1, "shown once");
});

test("late escalation: a flag raised BEFORE this turn does not put a banner on it", async () => {
  const harness = lateJudgementHarness(() => ({ needsAttention: true, attentionFlaggedAt: "2026-11-21T09:00:00.000Z", followUpContact: "r•••@gmail.com" }));
  await finishPendingTurn(harness);
  await harness.h.advance(30_000);
  assert.equal(harness.h.postedOfType("widget:late_escalation").length, 0);
});

test("late escalation: polls fast only while watching (30 s), then back to the slow cadence", async () => {
  const harness = lateJudgementHarness(() => ({ needsAttention: false, attentionFlaggedAt: null, followUpContact: null }));
  await finishPendingTurn(harness);
  const { h } = harness;
  const polled = () => h.requestsTo("/api/chat/poll").length;
  await h.advance(30_000);
  assert.equal(polled(), 12, "2.5 s cadence for the 30 s watch");
  const atEnd = polled();
  await h.advance(14_000);
  assert.ok(polled() - atEnd <= 1, "slow cadence after the watch");
});

test("the widget puts the late banner on the right reply, once, and the message is validated", () => {
  const { applyLateEscalation } = loadModule("lib/widget-stream-reducer.ts");
  const messages = [
    { id: "u1", role: "user", content: "hi" },
    { id: "a1", role: "assistant", content: "Whitening is 3,000 rupees." },
    { id: "a2", role: "assistant", content: "Anything else?", escalate: true, followUpContact: "x" },
  ];
  const out = JSON.parse(JSON.stringify(applyLateEscalation(messages, "a1", "+91 98•••••210")));
  assert.deepEqual(out[1], { id: "a1", role: "assistant", content: "Whitening is 3,000 rupees.", escalate: true, followUpContact: "+91 98•••••210" });
  assert.deepEqual(out[0], messages[0]);
  assert.equal(JSON.parse(JSON.stringify(applyLateEscalation(messages, "a2", "y")))[2].followUpContact, "x", "an escalated reply is untouched");

  const { parseFromParentMessage } = loadModule("app/(widget)/widget/embed/_lib/post-message.ts");
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseFromParentMessage({ type: "widget:late_escalation", requestId: "r1", followUpContact: "+91 98•••••210" }))),
    { type: "widget:late_escalation", requestId: "r1", followUpContact: "+91 98•••••210" },
  );
  assert.equal(parseFromParentMessage({ type: "widget:late_escalation" }), null);
  const hook = source("app/(widget)/widget/embed/_lib/use-widget-chat.ts");
  assert.match(hook, /if \(message\.judgementPending && !message\.escalate\) \{\s*lateJudgementRef\.current\.set\(message\.requestId, pending\.assistantPlaceholderId\)/);
  assert.match(hook, /applyLateEscalation\(prev, replyId, message\.followUpContact\)/);
});

test("the widget poll reports the flag, when it was raised, and the masked contact only when flagged", () => {
  const poll = source("app/api/chat/poll/route.ts");
  assert.match(poll, /needsAttention: conversation\.needs_attention/);
  assert.match(poll, /attentionFlaggedAt: conversation\.attention_flagged_at/);
  assert.match(poll, /conversation\.needs_attention\s*\?\s*await getMaskedFollowUpContact\(supabase, business\.businessId, conversationId\)\s*:\s*null/);
});

test("withRequestTiming: Next's own rendering signals (build-time static probe) are rethrown without a log line", async () => {
  const { withRequestTiming } = loadModule("lib/request-timing.ts", {}, { globalThis: {} });
  const lines = [];
  const probe = Object.assign(new Error("Dynamic server usage: headers"), { digest: "DYNAMIC_SERVER_USAGE" });
  await assert.rejects(
    withRequestTiming("onboarding_render", async () => { throw probe; }, undefined, { write: (line) => lines.push(line) }),
    (error) => error === probe,
  );
  assert.equal(lines.length, 0);
});

test("fonts: self-hosted files, the variables the app reads point at the shared family names", () => {
  for (const file of ["app/(dashboard)/layout.tsx", "app/(widget)/layout.tsx"]) {
    assert.doesNotMatch(source(file), /next\/font\/google/, file);
  }
  const css = source("app/fonts/fonts.css");
  for (const variable of ["--font-hanken", "--widget-font-sans"]) {
    assert.match(css, new RegExp(variable + ': "Hanken Grotesk", "Hanken Grotesk Fallback";'));
  }
  for (const variable of ["--font-space", "--widget-font-label"]) {
    assert.match(css, new RegExp(variable + ': "Space Grotesk", "Space Grotesk Fallback";'));
  }
  for (const file of ["app/fonts/dashboard-fonts.ts", "app/fonts/widget-fonts.ts"]) {
    const text = source(file);
    assert.match(text, /import "\.\/fonts\.css";/);
    assert.equal((text.match(/localFont\(\{/g) ?? []).length, 7, file);
    assert.equal((text.match(/preload: false/g) ?? []).length, 5, file + ": only the two latin files are preloaded");
    assert.equal((text.match(/value: "Hanken Grotesk"/g) ?? []).length, 4, file);
    assert.equal((text.match(/value: "Space Grotesk"/g) ?? []).length, 3, file);
  }
});

// --------------- conversation list poll (owner addition to item 3)
test("GET /api/dashboard/conversations: 401 without a session business; the session's own list, never cached", async () => {
  const denied = loadRoute("app/api/dashboard/conversations/route.ts", { context: null, loaders: {} });
  assert.equal((await denied.GET()).status, 401);
  assert.equal(denied.seen.length, 0);

  const list = { conversations: [{ id: "c1" }], leads: [], lastMessages: [] };
  const route = loadRoute("app/api/dashboard/conversations/route.ts", { context: { businessId: "business-a" }, loaders: { list } });
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(route.seen, [["list", "business-a"]]);
});

test("loadConversationList: the same tenant-scoped reads as the old action, leads reduced to name pairs", async () => {
  const calls = [];
  const { loadConversationList } = loadModule("lib/dashboard-poll.ts", {
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({}) },
    "@/lib/conversations": {
      listConversationsForBusiness: async (_s, businessId) => { calls.push(["conversations", businessId]); return [{ id: "c1" }, { id: "c2" }]; },
    },
    "@/lib/internal-notifications": {},
    "@/lib/messages": {
      listLastMessagesForConversations: async (_s, businessId, ids) => { calls.push(["last", businessId, ids.join(",")]); return []; },
    },
    "@/lib/leads": {
      listLeadsForBusiness: async (businessId) => {
        calls.push(["leads", businessId]);
        return [{ conversation_id: "c1", contact_name: "Ravi", email: "r@x.co", phone: "+91 98" }];
      },
    },
    "@/lib/logger": {},
  });
  const result = JSON.parse(JSON.stringify(await loadConversationList("business-a")));
  assert.deepEqual(calls, [["conversations", "business-a"], ["leads", "business-a"], ["last", "business-a", "c1,c2"]]);
  assert.deepEqual(result.leads, [{ conversationId: "c1", contactName: "Ravi" }]); // no email/phone in the poll
});

test("the conversation list polls with fetch: 1 s -> 5 s on the list, 5 s beside an open conversation, paused when hidden", () => {
  const pane = source("app/(dashboard)/dashboard/conversations/_components/chat-list-pane.tsx");
  assert.doesNotMatch(pane, /from "\.\.\/actions"/);
  assert.match(pane, /fetchConversationList\(\)/);
  assert.match(pane, /isIndex \? nextPollDelayMs\(lastChangeAtRef\.current, Date\.now\(\)\) : POLL_SLOW_MS/);
  assert.match(pane, /visibilityState === "visible"/);
  assert.doesNotMatch(source("app/(dashboard)/dashboard/conversations/actions.ts"), /pollConversationsAction/);
  // Every dashboard poll is now a GET route; none is a Server Action.
  for (const file of [
    "app/(dashboard)/dashboard/_components/attention-provider.tsx",
    "app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx",
    "app/(dashboard)/dashboard/conversations/_components/chat-list-pane.tsx",
  ]) {
    assert.match(source(file), /@\/lib\/dashboard-poll-client/, file);
  }
});
