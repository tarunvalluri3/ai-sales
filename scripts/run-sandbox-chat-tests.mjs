import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Production incident 2026-11-21: actions.ts ("use server") exported a Zod
// object, so Next.js refused to load it and every sendSandboxMessage call 500ed.
// Mocks only -- no network, database or Gemini.

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
const dashboard = "app/(dashboard)/dashboard/";
const actionsPath = dashboard + "_components/sandbox-chat/actions.ts";
const panelPath = dashboard + "_components/sandbox-chat/sandbox-chat-panel.tsx";

function loadModule(path, mocks = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, URL, console, process, Promise,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "zod") return require(name);
      if (name === "server-only") return {};
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return exports;
}

// ------------------------------------------------------- "use server" guard
function walk(dir, out = []) {
  for (const name of readdirSync(new URL(dir, root))) {
    if (name === "node_modules" || name === ".next") continue;
    const rel = dir + name;
    if (statSync(new URL(rel, root)).isDirectory()) walk(rel + "/", out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test('a "use server" file exports only async functions and types (Next.js fails the whole module otherwise)', () => {
  const offenders = [];
  let checked = 0;
  for (const file of [...walk("app/"), ...walk("lib/")]) {
    const text = source(file);
    if (!/^\s*["']use server["'];?/m.test(text.slice(0, 400))) continue;
    checked++;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    for (const node of sf.statements) {
      const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isExportDeclaration(node)) {
        const typeOnly = node.isTypeOnly || node.exportClause?.elements?.every((e) => e.isTypeOnly);
        if (!typeOnly) offenders.push(file + ": export { ... }");
      } else if (ts.isExportAssignment(node)) {
        offenders.push(file + ": export default");
      } else if (exported) {
        const isAsyncFn = ts.isFunctionDeclaration(node) && node.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        const isType = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);
        if (!isAsyncFn && !isType) offenders.push(file + ": " + node.getText(sf).slice(0, 60));
      }
    }
  }
  assert.ok(checked > 0, "found no use-server files to check");
  assert.equal(offenders.length, 0, offenders.join(", "));
});

// ------------------------------------------------------------- action harness
const draftBusiness = {
  name: "Peak Fitness Studio", agent_name: "Peak", description: "Gym", contact_email: "a@b.co", contact_phone: null,
  website: null, currency: "INR", timezone: "Asia/Kolkata", widget_language: "en",
  recommend_products_enabled: true, appointments_enabled: false, live_version_id: null,
};
const liveSnapshot = {
  config: {
    name: "Peak Live", description: "Live desc", contactEmail: "l@b.co", contactPhone: null, website: null, language: "en",
    persona: { agentName: "LivePeak" }, capabilities: { recommendProducts: false, appointments: true },
  },
};

function harness({ business = draftBusiness, liveEnabled = true, liveSource = { kind: "live", versionId: "v1", snapshot: liveSnapshot } } = {}) {
  const calls = { ask: [], messages: [], conversations: [], loadLive: [], context: 0 };
  const sandboxMode = loadModule("lib/sandbox-mode.ts");
  const mocks = {
    "next/server": { after: () => {} },
    "@/lib/business-context": { requireBusinessContext: async () => { calls.context++; return { businessId: "tenant-a", orgId: "org-a" }; } },
    "@/lib/guardrails/prepare-message": { prepareProspectMessage: (m) => ({ text: m.trim(), empty: m.trim() === "", signals: [] }) },
    "@/lib/guardrails/record": { recordGuardrailSignals: async () => {} },
    "@/lib/business": { getBusinessForOrg: async (orgId) => { assert.equal(orgId, "org-a"); return business; } },
    "@/lib/supabase/server": { createServerSupabaseClient: () => ({ client: "session" }) },
    "@/lib/conversations": {
      SANDBOX_CONVERSATION_SOURCE: "dashboard_test",
      getConversationForBusiness: async () => null,
      createConversation: async (_s, businessId, src) => { calls.conversations.push([businessId, src]); return { id: "conv-1", source: src }; },
    },
    "@/lib/messages": { createMessage: async (_s, businessId, convId, role, content) => { calls.messages.push([businessId, convId, role, content]); } },
    "@/lib/rag": {
      askSalesEmployee: async (...args) => {
        calls.ask.push(args);
        return { answer: "Hello from the agent", sourceChunkIds: [], grounded: true, recommendedProducts: [], sandboxBooking: false };
      },
    },
    "@/lib/errors": { logAndGetUserMessage: () => "Unable to run the test." },
    "@/lib/agent-runtime": {
      DRAFT_SOURCE: { kind: "draft" },
      loadLiveAgentSourceByVersion: async (businessId, versionId) => { calls.loadLive.push([businessId, versionId]); return liveSource; },
    },
    "@/lib/agent-published": loadModule("lib/agent-published.ts"),
    "@/lib/sandbox-mode": { ...sandboxMode, LIVE_SANDBOX_ENABLED: liveEnabled },
  };
  return { calls, actions: loadModule(actionsPath, mocks) };
}

// ----------------------------------------------------------------- Draft mode
test("draft mode runs end to end on the session client and the draft source", async () => {
  const { actions, calls } = harness();
  const result = await actions.sendSandboxMessage(null, [], "What are your hours?", "draft");
  assert.deepEqual(JSON.parse(JSON.stringify({ ok: result.ok, answer: result.answer, conversationId: result.conversationId })), { ok: true, answer: "Hello from the agent", conversationId: "conv-1" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.conversations)), [["tenant-a", "dashboard_test"]]);
  assert.deepEqual(calls.messages.map((m) => m[2]), ["user", "assistant"]);
  assert.equal(calls.loadLive.length, 0, "draft must not load the live snapshot");
  const args = calls.ask[0];
  assert.equal(args[0].client, "session");
  assert.equal(args[1], "tenant-a");
  assert.equal(args[3], "Peak Fitness Studio");
  assert.equal(args[4].agentName, "Peak");
  assert.deepEqual(JSON.parse(JSON.stringify(args.at(-1))), { kind: "draft" });
});

test("the onboarding review step calls the action exactly as its panel does", async () => {
  // review-step.tsx renders <SandboxChatPanel /> (no liveAvailable); the panel
  // calls sendSandboxMessage(conversationIdRef.current, history, text, mode)
  // with mode defaulting to "draft" and conversationIdRef starting null.
  const review = source("app/(dashboard)/onboarding/_components/steps/review-step.tsx");
  assert.match(review, /<SandboxChatPanel \/>/);
  const panel = source(panelPath);
  assert.match(panel, /useState<SandboxMode>\("draft"\)/);
  assert.match(panel, /sendSandboxMessage\(conversationIdRef\.current, history, text, mode\)/);
  assert.match(panel, /conversationIdRef = useRef<string \| null>\(null\)/);
  const { actions } = harness();
  const first = await actions.sendSandboxMessage(null, [], "Hi", "draft");
  assert.equal(first.ok, true);
  const second = await actions.sendSandboxMessage(
    first.conversationId,
    [{ role: "user", content: "Hi" }, { role: "assistant", content: first.answer }],
    "Price?",
    "draft",
  );
  assert.equal(second.ok, true);
});

test("a caller that omits mode still gets the draft (default), and a bad mode is refused", async () => {
  const { actions, calls } = harness();
  assert.equal((await actions.sendSandboxMessage(null, [], "Hi")).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.ask[0].at(-1))), { kind: "draft" });
  const bad = await actions.sendSandboxMessage(null, [], "Hi", "version-123");
  assert.equal(bad.ok, false);
  assert.equal(calls.ask.length, 1);
});

test("an empty message is refused before anything is written", async () => {
  const { actions, calls } = harness();
  const result = await actions.sendSandboxMessage(null, [], "   ", "draft");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "Enter a message." });
  assert.equal(calls.messages.length, 0);
});

// ------------------------------------------------------------------ Live mode
test("live mode on a published business uses the session's own version and the live config", async () => {
  const { actions, calls } = harness({ business: { ...draftBusiness, live_version_id: "v1" } });
  const result = await actions.sendSandboxMessage(null, [], "Hi", "live");
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.loadLive)), [["tenant-a", "v1"]]);
  const args = calls.ask[0];
  assert.equal(args[3], "Peak Live");
  assert.equal(args[4].agentName, "LivePeak");
  assert.equal(args.at(-1).kind, "live");
});

test("live mode on an unpublished business is rejected without touching the AI", async () => {
  const { actions, calls } = harness({ business: { ...draftBusiness, live_version_id: null } });
  const result = await actions.sendSandboxMessage(null, [], "Hi", "live");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "Publish your agent before testing the live version." });
  assert.equal(calls.ask.length, 0);
  assert.equal(calls.loadLive.length, 0);
});

test("live mode fails closed when the snapshot cannot be loaded", async () => {
  const { actions, calls } = harness({ business: { ...draftBusiness, live_version_id: "v1" }, liveSource: null });
  const result = await actions.sendSandboxMessage(null, [], "Hi", "live");
  assert.equal(result.ok, false);
  assert.equal(calls.ask.length, 0);
});

// ----------------------------------------------------- Live as shipped (off)
test("as shipped, Live is switched off: the action refuses it and the panel disables it", async () => {
  const flag = loadModule("lib/sandbox-mode.ts");
  assert.equal(flag.LIVE_SANDBOX_ENABLED, false);
  const { actions, calls } = harness({ business: { ...draftBusiness, live_version_id: "v1" }, liveEnabled: flag.LIVE_SANDBOX_ENABLED });
  const result = await actions.sendSandboxMessage(null, [], "Hi", "live");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "Live testing is coming soon. Draft uses your current setup." });
  assert.equal(calls.context, 0, "refused before any business lookup");
  assert.equal(calls.ask.length, 0);
  const panel = source(panelPath);
  assert.match(panel, /disabled=\{isPending \|\| \(option === "live" && !LIVE_SANDBOX_ENABLED\)\}/);
  assert.match(panel, /Live testing is coming soon\. Draft uses your current setup\./);
  // Why it is off: the live RPC is not executable by the session role.
  const mig = source("supabase/migrations/20261107000000_agent_draft_publish.sql");
  assert.match(mig, /revoke execute on function public\.match_live_knowledge_chunks[\s\S]*?from public, anon, authenticated;/);
});
