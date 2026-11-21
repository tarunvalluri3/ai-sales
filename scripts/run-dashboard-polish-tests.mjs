import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
export const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const dashboard = "app/(dashboard)/dashboard/";

function loadModule(path, mocks = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports, URL, File, FormData, Intl, Date, console, process,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "zod") return require(name);
      if (name === "server-only") return {};
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return exports;
}

const businessSchemaMocks = {
  "@/lib/widget-i18n": { SUPPORTED_WIDGET_LANGUAGES: ["en"] },
  "@/lib/currency": loadModule("lib/currency.ts"),
};
const businessSchema = () => loadModule("lib/schemas/business.ts", businessSchemaMocks);

// ---------------------------------------------------------------- Item 1
function clerkOrgModule(org, calls, { failUpdate = false } = {}) {
  return loadModule("lib/clerk-org-name.ts", {
    "@/lib/schemas/business": businessSchema(),
    "@clerk/nextjs/server": {
      clerkClient: async () => ({
        organizations: {
          getOrganization: async (args) => {
            calls.push(["get", args.organizationId]);
            return { name: org.name };
          },
          updateOrganization: async (id, body) => {
            calls.push(["update", id, body.name]);
            if (failUpdate) throw new Error("clerk down");
          },
        },
      }),
    },
  });
}

test("rename uses the given session org id and the new business name", async () => {
  const calls = [];
  const { syncClerkOrganizationName } = clerkOrgModule({ name: "My Organization" }, calls);
  await syncClerkOrganizationName("org_session", "  Peak Fitness Studio ");
  assert.deepEqual(calls.at(-1), ["update", "org_session", "Peak Fitness Studio"]);
});

test("a Clerk error never throws out of the rename", async () => {
  const calls = [];
  const { syncClerkOrganizationName } = clerkOrgModule({ name: "Old" }, calls, { failUpdate: true });
  await assert.doesNotReject(syncClerkOrganizationName("org_session", "New Name"));
});

test("no rename when the name is already right or empty", async () => {
  const calls = [];
  const { syncClerkOrganizationName } = clerkOrgModule({ name: "Same" }, calls);
  await syncClerkOrganizationName("org_session", "Same");
  await syncClerkOrganizationName("org_session", "   ");
  assert.equal(calls.filter((c) => c[0] === "update").length, 0);
});

test("backfill renames only a Clerk default name, once per org", async () => {
  for (const defaultName of ["My Organization", "Tarun's Organization"]) {
    const calls = [];
    const { ensureClerkOrganizationName } = clerkOrgModule({ name: defaultName }, calls);
    await ensureClerkOrganizationName("org_a", "Peak Fitness Studio");
    await ensureClerkOrganizationName("org_a", "Peak Fitness Studio");
    assert.deepEqual(calls.filter((c) => c[0] === "update"), [["update", "org_a", "Peak Fitness Studio"]]);
  }
  const custom = [];
  const mod = clerkOrgModule({ name: "Hand-picked Name" }, custom);
  await mod.ensureClerkOrganizationName("org_b", "Peak Fitness Studio");
  assert.equal(custom.filter((c) => c[0] === "update").length, 0);
  const none = [];
  await clerkOrgModule({ name: "My Organization" }, none).ensureClerkOrganizationName("org_c", "My Organization");
  assert.equal(none.length, 0, "a business that itself has a default-looking name is not synced");
});

test("profile save renames the session org, ignores a client org id, and survives a Clerk failure", async () => {
  const renamed = [];
  const run = async (syncImpl) => {
    const mod = loadModule(dashboard + "profile/actions.ts", {
      "next/cache": { revalidatePath() {} },
      "next/navigation": { redirect() {} },
      "next/server": { after: (fn) => { void fn(); } },
      "@/lib/clerk-org-name": { syncClerkOrganizationName: syncImpl },
      "@/lib/auth": { requireAuthContext: async () => ({ orgId: "org_session" }) },
      "@/lib/business": {
        updateBusinessProfile: async () => ({ id: "b1", timezone: "Asia/Kolkata" }),
        getBusinessForOrg: async () => null,
        deleteBusinessForOrg: async () => true,
      },
      "@/lib/data-export": {},
      "@/lib/schemas/business": { businessProfileSchema: { safeParse: (v) => ({ success: true, data: { ...v, name: "Peak Fitness Studio" } }) } },
      "@/lib/errors": { logAndGetUserMessage: () => "err" },
      "@/lib/timezones": { normalizeTimezone: () => ({ ok: true, timezone: "Asia/Kolkata" }), TIMEZONE_ERROR_MESSAGES: {} },
      "@/lib/business-hours": { updateBusinessTimezone: async () => {} },
    });
    const form = new FormData();
    form.set("name", "Peak Fitness Studio");
    form.set("orgId", "org_evil");
    form.set("organizationId", "org_evil");
    return mod.updateBusinessProfileAction({}, form);
  };
  const ok = await run(async (orgId, name) => { renamed.push([orgId, name]); });
  assert.equal(ok.success, true);
  assert.deepEqual(renamed, [["org_session", "Peak Fitness Studio"]]);
});

test("onboarding create renames with the session org only", () => {
  const src = source("app/(dashboard)/onboarding/actions.ts");
  assert.match(src, /const sessionOrgId = context\.orgId;\s+after\(\(\) => syncClerkOrganizationName\(sessionOrgId, parsed\.data\.name\)\)/);
  assert.doesNotMatch(src, /syncClerkOrganizationName\([^)]*formData/);
});

test("dashboard layout backfills the org name for admins only, off the request path", () => {
  const src = source(dashboard + "layout.tsx");
  assert.match(src, /hasMinRole\(orgRole, "org:admin"\)\) after\(\(\) => ensureClerkOrganizationName\(orgId, businessName\)\)/);
});

// ---------------------------------------------------------------- Item 2
const sandboxActions = dashboard + "_components/sandbox-chat/actions.ts";

test("test chat mode is a closed enum validated server-side", () => {
  const src = source(sandboxActions);
  assert.match(src, /sandboxModeSchema = z\.enum\(\["draft", "live"\]\)/);
  assert.match(src, /sandboxModeSchema\.safeParse\(mode\)/);
});

test("live test chat takes the version from the session's business row, never from the client", () => {
  const src = source(sandboxActions);
  assert.match(src, /loadLiveAgentSourceByVersion\(businessId, business\.live_version_id\)/);
  assert.match(src, /const \{ businessId, orgId \} = await requireBusinessContext\(\)/);
  const signature = src.slice(src.indexOf("export async function sendSandboxMessage"), src.indexOf("): Promise<SandboxChatResult>"));
  assert.doesNotMatch(signature, /version/i);
  assert.match(src, /isAgentPublished\(business\)/);
});

test("test chat keeps its sandbox guarantees in both modes", () => {
  const src = source(sandboxActions);
  assert.match(src, /SANDBOX_CONVERSATION_SOURCE/);
  assert.match(src, /Test booking — nothing was saved and no one was notified\./);
  assert.match(src, /"dashboard",\s+source,\s+\)/);
  assert.match(src, /prepareProspectMessage\(message\)/);
});

test("Test your agent sits right under Overview and its page needs a published agent", () => {
  const nav = source(dashboard + "_components/nav-items.tsx");
  assert.match(nav, /label: "Overview"[^}]*\},\s+\{ label: "Test your agent", href: "\/dashboard\/test-agent"/);
  const page = source(dashboard + "test-agent/page.tsx");
  assert.match(page, /requireLiveBusinessContext\(\)/);
  assert.match(page, /<SandboxChatPanel liveAvailable \/>/);
  assert.doesNotMatch(source("app/(dashboard)/onboarding/_components/steps/review-step.tsx"), /liveAvailable/);
});
