import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
  assert.deepEqual(Object.keys(parsed).sort(), ["cold", "event", "instanceAgeMs", "name", "outcome", "processUptimeMs", "stages", "totalMs"]);
  assert.equal(parsed.event, "request_timing");
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
