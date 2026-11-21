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

// ---------------------------------------------------------------- Item 3
test("welcome card only claims the widget answers when a key lists an allowed origin", () => {
  const { widgetAnswersVisitors } = loadModule(dashboard + "_components/launch-card.tsx", {
    "next/link": {}, "lucide-react": {}, "../widget-settings/copy-key-button": {}, "./add-origin-form": {},
    "react/jsx-runtime": { jsx() {}, jsxs() {}, Fragment: null },
  });
  assert.equal(widgetAnswersVisitors([]), false);
  assert.equal(widgetAnswersVisitors([{ status: "active", allowed_origins: [] }]), false);
  assert.equal(widgetAnswersVisitors([{ status: "revoked", allowed_origins: ["https://a.com"] }]), false);
  assert.equal(widgetAnswersVisitors([{ status: "active", allowed_origins: ["https://a.com"] }]), true);
});

test("welcome card claims only connected, plan-allowed channels", () => {
  const page = source(dashboard + "page.tsx");
  assert.match(page, /meta\.whatsapp && channelAllowed\(entitlement, "whatsapp"\)/);
  assert.match(page, /meta\.instagram && channelAllowed\(entitlement, "instagram"\)/);
  const card = source(dashboard + "_components/launch-card.tsx");
  assert.match(card, /widgetReady \? "Your AI sales employee is live"/);
  assert.match(card, /\{!widgetReady \? <AddOriginForm \/> : null\}/);
});

test("add-website action validates with the Widget settings origin parser and uses the session business", async () => {
  const calls = [];
  const mod = loadModule(dashboard + "widget-settings/actions.ts", {
    zod: require("zod"),
    "@/lib/schemas/agent-persona": { agentNameSchema: {} },
    "@/lib/agent-images": {},
    "next/cache": { revalidatePath() {} },
    "next/server": { after() {} },
    "@/lib/answer-bank/generate": {},
    "@/lib/business-context": { requireBusinessContext: async () => ({ businessId: "biz_session", userId: "u1", orgRole: "org:admin" }) },
    "@/lib/auth": { requireMinRole: () => null },
    "@/lib/widget-keys": {
      createWidgetKey: async () => ({}), revokeWidgetKey: async () => true,
      ensureWidgetKey: async (businessId, origin) => { calls.push(["ensure", businessId, origin]); return { key: { id: "k1", name: "n", allowed_origins: [] }, created: true }; },
      updateWidgetKeyOrigins: async () => true,
    },
    "@/lib/onboarding-readiness-data": {}, "@/lib/onboarding-readiness": {}, "@/lib/schemas/business": {},
    "@/lib/schemas/widget-origin": loadModule("lib/schemas/widget-origin.ts"),
    "@/lib/widget-suggested-questions": {},
    "@/lib/audit-log": { recordAuditLogEntry: async () => {} },
    "@/lib/errors": { logAndGetUserMessage: () => "err" },
    "@/lib/business": {}, "@/lib/schemas/widget-chat-request": {},
  });
  const submit = (origin, extra = {}) => {
    const form = new FormData();
    form.set("origin", origin);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    return mod.addWidgetOriginAction({}, form);
  };
  for (const bad of ["", "example.com", "https://example.com/", "https://example.com/pricing", "https://a.com, https://b.com"]) {
    const r = await submit(bad);
    assert.ok(r.error, "rejects " + JSON.stringify(bad));
  }
  assert.equal(calls.length, 0);
  const ok = await submit("https://example.com", { businessId: "biz_evil" });
  assert.equal(ok.success, true);
  assert.deepEqual(calls, [["ensure", "biz_session", "https://example.com"]]);
});

// ---------------------------------------------------------------- Items 4 and 7 (already fixed; pinned)
test("Appearance hours hint keeps its Business Hours link text", () => {
  const src = source(dashboard + "widget-settings/widget-branding-form.tsx");
  assert.match(src, /Your schedule is set in\{" "\}\s+<Link href="\/dashboard\/business-hours"[^>]*>\s+Business Hours\s+<\/Link>/);
});

test("dashboard sidebar and drawer use the theme-aware logo", () => {
  const sidebar = source(dashboard + "_components/sidebar.tsx");
  assert.match(sidebar, /<ThemedWavesLogo \/>/);
  assert.match(sidebar, /<ThemedWavesLogo compact \/>/);
  const logo = source("app/(dashboard)/_components/waves-logo.tsx");
  assert.match(logo, /wave-logo-on-dark[\s\S]*tone="dark"[\s\S]*wave-logo-on-light[\s\S]*tone="light"/);
});

// ---------------------------------------------------------------- Item 5
test("onboarding step heading keeps programmatic focus but loses the mouse focus box", () => {
  assert.match(source("app/(dashboard)/onboarding/_components/wizard-shell.tsx"), /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source("app/(dashboard)/onboarding/onboarding.css"), /h1\[tabindex="-1"\]:focus:not\(:focus-visible\)\s*\{\s*outline: none;/);
});

test("welcome card shows a confirmation mark that animates only without reduced-motion", () => {
  assert.match(source(dashboard + "_components/launch-card.tsx"), /launch-card-mark/);
  const css = source("app/(dashboard)/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.launch-card-mark \{\s*animation: launch-card-mark/);
});

// ---------------------------------------------------------------- Item 6
import { readdirSync, statSync } from "node:fs";

test("the same instant is shown in the business zone, Indian format for India", () => {
  const { formatDateTime, formatDate, formatTime, formatCalendarDate, localeForTimezone } = loadModule("lib/format-business-time.ts");
  const instant = "2026-11-20T10:19:27Z"; // the header bug: UTC 10:19 is 3:49 pm in India
  assert.equal(formatDateTime(instant, "Asia/Kolkata"), "20 Nov 2026, 3:49 pm");
  assert.equal(formatDateTime(instant, "America/New_York"), "Nov 20, 2026, 5:19 AM");
  assert.equal(formatTime(instant, "Asia/Kolkata"), "3:49 pm");
  assert.equal(formatDate(instant, "Asia/Calcutta"), "20 Nov 2026");
  assert.equal(localeForTimezone("Asia/Kolkata"), "en-IN");
  assert.equal(localeForTimezone("Europe/London"), "en-US");
  // Midnight rollover: 19:00 UTC is already the next day in India.
  assert.equal(formatDate("2026-11-20T19:00:00Z", "Asia/Kolkata"), "21 Nov 2026");
  // A stored calendar day never shifts with the zone.
  assert.equal(formatCalendarDate("2026-11-21", "Asia/Kolkata"), "Sat, 21 Nov, 2026");
  assert.equal(formatCalendarDate("2026-11-21", "Pacific/Auckland"), "Sat, Nov 21, 2026");
});

test("bad input never throws", () => {
  const { formatDateTime } = loadModule("lib/format-business-time.ts");
  assert.equal(formatDateTime("not a date", "Asia/Kolkata"), "");
  assert.match(formatDateTime("2026-11-20T10:19:27Z", "Not/AZone"), /2026/);
});

test("no dashboard file formats a date without the business zone", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(new URL("../" + dir, import.meta.url))) {
      const path = dir + "/" + name;
      if (statSync(new URL("../" + path, import.meta.url)).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) {
        const text = source(path);
        if (text.includes(".toLocaleDateString(") || text.includes(".toLocaleTimeString(") || /new Date\([^)]*\)\.toLocaleString\(/.test(text)) offenders.push(path);
        if (/new Intl\.DateTimeFormat\((?!"en-CA")/.test(text)) offenders.push(path);
      }
    }
  };
  walk("app/(dashboard)/dashboard");
  assert.deepEqual(offenders, []);
});

test("the dashboard layout provides the business zone from the session's business", () => {
  const layout = source(dashboard + "layout.tsx");
  assert.match(layout, /<BusinessTimeProvider timezone=\{timezone\}>/);
  assert.match(source("lib/business-context.ts"), /timezone: business\.timezone/);
});

// ---------------------------------------------------------------- Item 8
test("mobile header is one non-wrapping row with the account controls behind a menu", () => {
  const header = source(dashboard + "_components/dashboard-header.tsx");
  assert.match(header, /<header className="relative flex w-full min-h-16 items-center[^"]*md:flex-wrap/);
  assert.doesNotMatch(header, /<header className="[^"]*\bflex-wrap\b(?<!md:flex-wrap)/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /event\.key === "Escape"/);
  // Each Clerk control and the bell are mounted exactly once.
  assert.equal(header.split("<OrganizationSwitcher").length - 1, 1);
  assert.equal(header.split("<UserButton").length - 1, 1);
  assert.equal(header.split("<NotificationBell").length - 1, 1);
  const bar = source(dashboard + "_components/publish-bar.tsx");
  assert.match(bar, /<span className="sm:hidden">Publish<\/span>/);
  assert.match(bar, /hidden font-normal sm:inline/);
});

// ---------------------------------------------------------------- Item 9
test("Appearance preview lays the widget out in flow so it can never be clipped", () => {
  const preview = source(dashboard + "widget-settings/widget-preview.tsx");
  assert.doesNotMatch(preview, /absolute inset-x-5 bottom-5/);
  assert.match(preview, /relative flex min-h-\[30rem\] flex-col justify-end/);
  assert.match(preview, /pointer-events-none absolute inset-x-5 top-5/);
  assert.match(preview, /<div className=\{`relative flex flex-col gap-3 \$\{alignLeft/);
});

// ---------------------------------------------------------------- Item 10
test("WhatsApp: Connect with Facebook comes first and the developer guide sits under Advanced", () => {
  const page = source(dashboard + "whatsapp/page.tsx");
  const signup = page.indexOf("<EmbeddedSignupButton");
  const advanced = page.indexOf("Advanced: connect manually");
  const guideInAdvanced = page.indexOf("<WhatsappSetupGuide hasConnection={false} />", advanced);
  assert.ok(signup > 0 && advanced > signup && guideInAdvanced > advanced);
  // The standalone guide above the connect area only remains where Embedded Signup is not configured.
  assert.match(page, /!connection && canEdit && entitled && !embeddedSignup \? <WhatsappSetupGuide/);
  // Entitlement and permission gates are untouched.
  assert.match(page, /!entitled \? \(\s*<ChannelUpgradeNotice/);
  assert.match(page, /canEdit \? \(\s*embeddedSignup/);
});

// ---------------------------------------------------------------- Item 11
test("Billing page shows the billing details form once and pre-fills it from what is saved", () => {
  const page = source(dashboard + "billing/page.tsx");
  const panel = source(dashboard + "billing/billing-panel.tsx");
  // The page's single editable form is re-keyed on the saved values so it re-syncs after a save.
  assert.match(page, /<BillingDetailsCard\s+key=\{`\$\{identityDefaults\.name\}\|\$\{identityDefaults\.address\}\|\$\{identityDefaults\.stateCode\}\|\$\{identityDefaults\.gstin\}`\}/);
  assert.match(page, /savedDetails=\{\{ stateName: billingStateName, complete: hasBillingDetails \}\}/);
  // With saved details the checkout form sends them as hidden inputs instead of repeating the fields.
  assert.match(panel, /savedDetails \? \(\s+savedDetails\.complete \? \(/);
  for (const name of ["billingName", "billingAddress", "stateCode", "gstin"]) {
    assert.match(panel, new RegExp(`<input type="hidden" name="${name}" value=\{identity\.`));
  }
  // Nothing on file: checkout is blocked with "Add your billing details first".
  assert.match(panel, /savedDetails !== undefined && !savedDetails\.complete/);
  assert.match(panel, /Add your billing details first\./);
  // The onboarding plan step (no savedDetails) keeps its inline fields.
  assert.match(panel, /<BillingDetailsFields\s+defaults=\{identity\}[\s\S]*idPrefix="checkout"/);
  assert.doesNotMatch(source("app/(dashboard)/onboarding/_components/steps/plan-step.tsx"), /savedDetails/);
});

// ---------------------------------------------------------------- Item 12
test("business-facing copy uses an em dash, not a double hyphen", () => {
  const files = [
    "app/(dashboard)/dashboard/audit-log/page.tsx",
    "app/(dashboard)/dashboard/appointments/actions.ts",
    "lib/business.ts", "lib/billing-cancellation.ts", "lib/billing-checkout.ts", "lib/billing-emails.ts",
    "lib/usage-reminders.ts", "lib/invoice-emails.ts", "lib/gstin.ts", "lib/file-ingestion.ts", "lib/url-ingestion.ts",
  ];
  for (const file of files) {
    const bad = source(file).split("\n").filter((line) =>
      line.includes(" -- ") && !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line) && /["'`][^"'`]* -- /.test(line));
    assert.deepEqual(bad, [], file);
  }
  assert.match(source("app/(dashboard)/dashboard/audit-log/page.tsx"), /Grace period lapsed — AI replies paused/);
});

// ---------------------------------------------------------------- Item 13
test("launch runbook carries the Clerk production checklist", () => {
  const doc = source("docs/launch-runbook.md");
  for (const needle of ["## 8. Clerk production checklist", "DNS records", "Waves AI Pilot", "Default naming rules", "CAPTCHA", "Organizations settings", "third-party auth provider", "Chrome, Edge, Safari", "600010", "CLERK_SECRET_KEY"]) {
    assert.ok(doc.includes(needle), needle);
  }
});
