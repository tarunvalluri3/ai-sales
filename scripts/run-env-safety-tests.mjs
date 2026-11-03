// Environment safety tests (production readiness, LAUNCH_AUDIT.md §3/§15).
//
//   1. lib/deployment-env.ts -- APP_ENV/VERCEL_ENV resolution, the "VPS with
//      no APP_ENV" refusal, Supabase ref parsing, which Gemini key each
//      environment uses, and the startup mismatch warnings.
//   2. scripts/lib/production-guard.mjs -- a script or test targeting the
//      production Supabase project (URL or CLI link) is refused; tests never
//      get an override; ops scripts need BOTH flags with the exact ref.
//   3. Wiring -- every unit suite preloads the guard, the pgTAP runner checks
//      the CLI link, and every DB-touching script calls the guard.
//
// Pure: no database, no network, no real env file is read.
// Run: npm run test:env-safety
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const env = await import(new URL("../lib/deployment-env.ts", import.meta.url).href);
const guard = await import(new URL("./lib/production-guard.mjs", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)

const PROD_REF = "bykeztxvejpwfcxgsubm";
const STAGING_REF = "abcdefghijklmnopqrst";
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

function fakeLinkedRoot(ref) {
  const root = mkdtempSync(path.join(tmpdir(), "env-safety-"));
  if (ref !== null) {
    mkdirSync(path.join(root, "supabase", ".temp"), { recursive: true });
    writeFileSync(path.join(root, "supabase", ".temp", "project-ref"), `${ref}\n`);
  }
  return root;
}

// ------------------------------------------------------------ deployment-env

test("APP_ENV wins over VERCEL_ENV; VERCEL_ENV maps preview to staging; default is development", () => {
  assert.deepEqual(env.resolveAppEnvironment({ APP_ENV: "production" }), { environment: "production", source: "APP_ENV" });
  assert.deepEqual(env.resolveAppEnvironment({ APP_ENV: "staging", VERCEL_ENV: "production" }), {
    environment: "staging",
    source: "APP_ENV",
  });
  assert.equal(env.resolveAppEnvironment({ VERCEL_ENV: "production" }).environment, "production");
  assert.equal(env.resolveAppEnvironment({ VERCEL_ENV: "preview" }).environment, "staging");
  assert.equal(env.resolveAppEnvironment({ VERCEL_ENV: "development" }).environment, "development");
  assert.deepEqual(env.resolveAppEnvironment({}), { environment: "development", source: "default" });
});

test("an unrecognised APP_ENV is an error, not a silent default", () => {
  assert.throws(() => env.resolveAppEnvironment({ APP_ENV: "prod" }), env.InvalidAppEnvironmentError);
});

test("a production server with neither APP_ENV nor VERCEL_ENV is ambiguous (the VPS case); next build is not", () => {
  assert.equal(env.isAmbiguousProductionServer({ NODE_ENV: "production" }), true);
  assert.equal(env.isAmbiguousProductionServer({ NODE_ENV: "production", APP_ENV: "production" }), false);
  assert.equal(env.isAmbiguousProductionServer({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(env.isAmbiguousProductionServer({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }), false);
  assert.equal(env.isAmbiguousProductionServer({ NODE_ENV: "development" }), false);
});

test("only production uses GEMINI_API_KEY", () => {
  assert.equal(env.geminiKeyVariableFor("production"), "GEMINI_API_KEY");
  assert.equal(env.geminiKeyVariableFor("staging"), "GEMINI_API_KEY_DEV");
  assert.equal(env.geminiKeyVariableFor("development"), "GEMINI_API_KEY_DEV");
});

test("Supabase project ref parsing", () => {
  assert.equal(env.supabaseProjectRefFromUrl(PROD_URL), PROD_REF);
  assert.equal(env.supabaseProjectRefFromUrl(`${STAGING_URL}/`), STAGING_REF);
  assert.equal(env.supabaseProjectRefFromUrl("http://127.0.0.1:54321"), null);
  assert.equal(env.supabaseProjectRefFromUrl("not a url"), null);
  assert.equal(env.supabaseProjectRefFromUrl(undefined), null);
});

test("the production ref is built in and PRODUCTION_SUPABASE_PROJECT_REFS only adds refs", () => {
  assert.equal(env.isProductionSupabaseRef(PROD_REF, {}), true);
  assert.equal(env.isProductionSupabaseRef(STAGING_REF, {}), false);
  assert.equal(env.isProductionSupabaseRef(STAGING_REF, { PRODUCTION_SUPABASE_PROJECT_REFS: ` ${STAGING_REF} ,` }), true);
  // Setting the variable never removes the built-in ref.
  assert.equal(env.isProductionSupabaseRef(PROD_REF, { PRODUCTION_SUPABASE_PROJECT_REFS: STAGING_REF }), true);
  assert.equal(env.isProductionSupabaseRef(null, {}), false);
});

test("startup warnings: dev against the production DB, production on a Clerk dev instance", () => {
  const devOnProd = env.environmentWarnings("development", { NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
  assert.equal(devOnProd.length, 1);
  assert.match(devOnProd[0], /PRODUCTION Supabase project/);
  assert.deepEqual(env.environmentWarnings("development", { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL }), []);
  const prodOnTestClerk = env.environmentWarnings("production", {
    NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    NEXT_PUBLIC_APP_URL: "https://aipilot.waveswebstudio.in",
  });
  assert.equal(prodOnTestClerk.length, 1);
  assert.match(prodOnTestClerk[0], /pk_test_/);
  // Warnings never contain a secret value, only names.
  for (const warning of [...devOnProd, ...prodOnTestClerk]) assert.doesNotMatch(warning, /pk_test_abc/);
});

// ---------------------------------------------------------- production guard

test("guard: a production NEXT_PUBLIC_SUPABASE_URL is refused", () => {
  assert.throws(
    () => guard.checkNotProductionTarget({ scriptName: "x", env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, argv: [] }),
    guard.ProductionTargetError,
  );
});

test("guard: staging and unset targets are allowed", () => {
  assert.equal(guard.checkNotProductionTarget({ scriptName: "x", env: { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL }, argv: [] }).production, false);
  assert.equal(guard.checkNotProductionTarget({ scriptName: "x", env: {}, argv: [] }).production, false);
});

test("guard: a CLI linked to production is refused when the runner uses the link", () => {
  const root = fakeLinkedRoot(PROD_REF);
  assert.throws(
    () => guard.checkNotProductionTarget({ scriptName: "pgTAP", env: {}, argv: [], checkLinkedProject: true, root }),
    /supabase CLI link/,
  );
  // Linked to staging: fine. Not linked at all: fine.
  assert.equal(
    guard.checkNotProductionTarget({ scriptName: "pgTAP", env: {}, argv: [], checkLinkedProject: true, root: fakeLinkedRoot(STAGING_REF) }).production,
    false,
  );
  assert.equal(
    guard.checkNotProductionTarget({ scriptName: "pgTAP", env: {}, argv: [], checkLinkedProject: true, root: fakeLinkedRoot(null) }).production,
    false,
  );
});

test("guard: a staging URL does not hide a production CLI link", () => {
  assert.throws(() =>
    guard.checkNotProductionTarget({
      scriptName: "pgTAP",
      env: { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL },
      argv: ["--allow-production", `--confirm-production-ref=${PROD_REF}`],
      checkLinkedProject: true,
      root: fakeLinkedRoot(PROD_REF),
    }),
  );
});

test("guard: tests never get an override, even with both flags", () => {
  assert.throws(() =>
    guard.checkNotProductionTarget({
      scriptName: "tests",
      env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL },
      argv: ["--allow-production", `--confirm-production-ref=${PROD_REF}`],
    }),
  );
});

test("guard: ops scripts need --allow-production AND the exact ref", () => {
  const base = { scriptName: "credit-note", env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, allowOverride: true };
  assert.throws(() => guard.checkNotProductionTarget({ ...base, argv: [] }));
  assert.throws(() => guard.checkNotProductionTarget({ ...base, argv: ["--allow-production"] }));
  assert.throws(() => guard.checkNotProductionTarget({ ...base, argv: [`--confirm-production-ref=${PROD_REF}`] }));
  assert.throws(() => guard.checkNotProductionTarget({ ...base, argv: ["--allow-production", "--confirm-production-ref=wrongref"] }));
  const ok = guard.checkNotProductionTarget({ ...base, argv: ["--allow-production", `--confirm-production-ref=${PROD_REF}`] });
  assert.equal(ok.overridden, true);
});

test("guard: the refusal message names the target but no secret", () => {
  try {
    guard.checkNotProductionTarget({
      scriptName: "x",
      env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL, SUPABASE_SECRET_KEY: "sb_secret_DO_NOT_PRINT" },
      argv: [],
    });
    assert.fail("expected a refusal");
  } catch (error) {
    assert.match(error.message, new RegExp(PROD_REF));
    assert.doesNotMatch(error.message, /sb_secret_DO_NOT_PRINT/);
  }
});

test("guard flags are recognised so script parsers can skip them", () => {
  assert.equal(guard.isProductionGuardFlag("--allow-production"), true);
  assert.equal(guard.isProductionGuardFlag(`--confirm-production-ref=${PROD_REF}`), true);
  assert.equal(guard.isProductionGuardFlag("--email"), false);
});

// -------------------------------------------------------------------- wiring

test("every unit test script preloads the guard", () => {
  const pkg = JSON.parse(read("package.json"));
  const unitSuites = Object.entries(pkg.scripts).filter(([name]) => name.startsWith("test:"));
  assert.ok(unitSuites.length >= 20);
  for (const [name, command] of unitSuites) {
    assert.match(command, /--import \.\/scripts\/lib\/test-env-guard\.mjs/, `${name} must preload the production guard`);
  }
});

test("the pgTAP runner checks the CLI link before running anything", () => {
  const source = read("scripts/run-pgtap-tests.mjs");
  assert.match(source, /guardAgainstProduction\(\{[^}]*checkLinkedProject: true/);
  assert.ok(source.indexOf("guardAgainstProduction({") < source.indexOf("listTestFiles();"));
});

test("every script that builds a Supabase client calls the guard", () => {
  for (const file of [
    "scripts/instagram-access.mjs",
    "scripts/seed-review-demo.mjs",
    "scripts/issue-credit-note.mjs",
    "scripts/run-evals.mjs",
    "scripts/measure-chat-latency.mjs",
    "scripts/measure-tool-call-rate.mjs",
  ]) {
    assert.match(read(file), /guardAgainstProduction\(\{ scriptName:/, `${file} must call the production guard`);
  }
});

test("lib/env.ts picks the Gemini key from the resolved environment, not VERCEL_ENV alone", () => {
  const source = read("lib/env.ts");
  assert.match(source, /resolveAppEnvironment\(process\.env\)/);
  assert.match(source, /isAmbiguousProductionServer\(process\.env\)/);
  assert.doesNotMatch(source, /process\.env\.VERCEL_ENV === "production"/);
});

test(".env.example is tracked and documents every variable lib/env.ts validates", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /^!\.env\.example$/m);
  const example = read(".env.example");
  const schemaKeys = [...read("lib/env.ts").matchAll(/^ {2}([A-Z][A-Z0-9_]+): z\./gm)].map((match) => match[1]);
  assert.ok(schemaKeys.length > 20);
  for (const key of schemaKeys) {
    assert.match(example, new RegExp(`^#? ?${key}=`, "m"), `.env.example must document ${key}`);
  }
});

// ------------------------------------------------------------ VPS hardening

const clientIp = await import(new URL("../lib/http/client-ip.ts", import.meta.url).href);
const headersOf = (map) => (name) => map[name] ?? null;

test("client IP: xff-first (Vercel default), xff-last (nginx appends), x-real-ip", () => {
  const spoofed = headersOf({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "203.0.113.9" });
  assert.equal(clientIp.clientIpFromHeaders(spoofed, "xff-first"), "6.6.6.6");
  assert.equal(clientIp.clientIpFromHeaders(spoofed, "xff-last"), "203.0.113.9", "the entry nginx appended");
  assert.equal(clientIp.clientIpFromHeaders(spoofed, "x-real-ip"), "203.0.113.9");
  assert.equal(clientIp.clientIpFromHeaders(headersOf({}), "xff-last"), "unknown");
  assert.equal(clientIp.clientIpFromHeaders(headersOf({ "x-forwarded-for": " , " }), "xff-first"), "unknown");
  assert.equal(clientIp.clientIpFromHeaders(headersOf({}), "x-real-ip"), "unknown");
});

test("client IP source parsing defaults to xff-first", () => {
  assert.equal(clientIp.parseClientIpSource(undefined), "xff-first");
  assert.equal(clientIp.parseClientIpSource("xff-last"), "xff-last");
  assert.equal(clientIp.parseClientIpSource("x-real-ip"), "x-real-ip");
  assert.equal(clientIp.parseClientIpSource("bogus"), "xff-first");
});

test("every IP read goes through the configured source", () => {
  assert.match(read("lib/http/widget-cors.ts"), /clientIpFromHeaders\(\(name\) => request\.headers\.get\(name\), parseClientIpSource\(process\.env\.CLIENT_IP_SOURCE\)\)/);
  assert.match(read("lib/admin-audit-log.ts"), /clientIpFromHeaders\(\(name\) => h\.get\(name\), parseClientIpSource\(process\.env\.CLIENT_IP_SOURCE\)\)/);
});

test("a non-Vercel production server without NEXT_PUBLIC_APP_URL is warned about", () => {
  const prodEnv = { NEXT_PUBLIC_SUPABASE_URL: PROD_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_x" };
  assert.ok(env.environmentWarnings("production", prodEnv).some((w) => /NEXT_PUBLIC_APP_URL/.test(w)));
  assert.equal(env.environmentWarnings("production", { ...prodEnv, NEXT_PUBLIC_APP_URL: "https://aipilot.waveswebstudio.in" }).length, 0);
  assert.equal(env.environmentWarnings("production", { ...prodEnv, VERCEL_ENV: "production" }).length, 0, "Vercel supplies its own URL");
});

test("HSTS is sent on every route (a VPS gets no platform HSTS); SSE disables proxy buffering", () => {
  assert.match(read("next.config.ts"), /\{ key: "Strict-Transport-Security", value: "max-age=31536000" \}/);
  assert.match(read("app/api/chat/route.ts"), /"X-Accel-Buffering": "no"/);
});

test("no unauthenticated dev/review pages ship (LAUNCH_AUDIT.md §11: /dev/fragments was public)", async () => {
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(path.join(ROOT, "app", "(dashboard)", "dev")), false);
});

// ------------------------------------- configurable production ref (item 4, 2026-11-03)

const refsFile = await import(new URL("../lib/production-refs-file.ts", import.meta.url).href);
const NEW_REGION_REF = "zyxwvutsrqponmlkjihg";

test("committed refs file: comments/blank lines ignored, junk dropped, the current ref is listed", () => {
  assert.deepEqual(refsFile.parseProductionRefs(`# comment\n\n ${NEW_REGION_REF} # new region\nnot-a-ref\nABCDEFGHIJKLMNOPQRST\n`), [
    NEW_REGION_REF,
    "abcdefghijklmnopqrst",
  ]);
  assert.ok(refsFile.parseProductionRefs(read("supabase/production-project-refs.txt")).includes(PROD_REF));
  assert.ok(env.BUILT_IN_PRODUCTION_SUPABASE_REFS.includes(PROD_REF), "the current ref stays built in");
});

test("guard: a NEW production ref in the committed file is refused with NO env var set (CLI link and URL)", () => {
  const root = fakeLinkedRoot(NEW_REGION_REF);
  writeFileSync(path.join(root, "supabase", "production-project-refs.txt"), `${PROD_REF}\n${NEW_REGION_REF}\n`);
  assert.throws(
    () => guard.checkNotProductionTarget({ scriptName: "pgTAP", env: {}, argv: [], checkLinkedProject: true, root }),
    new RegExp(NEW_REGION_REF),
  );
  assert.throws(
    () => guard.checkNotProductionTarget({ scriptName: "seed", env: { NEXT_PUBLIC_SUPABASE_URL: `https://${NEW_REGION_REF}.supabase.co` }, argv: [], root }),
    /PRODUCTION/,
  );
  // The old ref is still protected even if someone drops it from the file.
  writeFileSync(path.join(root, "supabase", "production-project-refs.txt"), `${NEW_REGION_REF}\n`);
  assert.throws(() => guard.checkNotProductionTarget({ scriptName: "seed", env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, argv: [], root }));
  // Without the file the new ref is NOT production (proves the file is what protects it).
  assert.equal(
    guard.checkNotProductionTarget({ scriptName: "seed", env: { NEXT_PUBLIC_SUPABASE_URL: `https://${NEW_REGION_REF}.supabase.co` }, argv: [], root: fakeLinkedRoot(null) }).production,
    false,
  );
});

test("the env var still adds refs on top of the file", () => {
  const merged = refsFile.withCommittedProductionRefs({ PRODUCTION_SUPABASE_PROJECT_REFS: STAGING_REF }, ROOT);
  assert.ok(env.isProductionSupabaseRef(STAGING_REF, merged));
  assert.ok(env.isProductionSupabaseRef(PROD_REF, merged));
});

// ------------------------------------- local next dev against production is blocked (2026-11-03)

test("next dev: production refused, exact-ref override allowed loudly, staging allowed", () => {
  const prod = { NEXT_PUBLIC_SUPABASE_URL: PROD_URL };
  const refused = env.checkDevServerTarget(prod);
  assert.equal(refused.action, "refuse");
  assert.match(refused.message, /Refusing to start next dev/);
  assert.match(refused.message, new RegExp(`ALLOW_DEV_AGAINST_PRODUCTION=${PROD_REF}`));
  assert.equal(env.checkDevServerTarget({ ...prod, ALLOW_DEV_AGAINST_PRODUCTION: "true" }).action, "refuse", "a bare flag is not enough");
  assert.equal(env.checkDevServerTarget({ ...prod, ALLOW_DEV_AGAINST_PRODUCTION: STAGING_REF }).action, "refuse", "another ref is not enough");
  assert.equal(env.checkDevServerTarget({ ...prod, ALLOW_DEV_AGAINST_PRODUCTION: ` ${PROD_REF.toUpperCase()} ` }).action, "allow_overridden");
  assert.equal(env.checkDevServerTarget({ NEXT_PUBLIC_SUPABASE_URL: STAGING_URL }).action, "allow");
  assert.equal(env.checkDevServerTarget({}).action, "allow");
  // A new production ref from the committed file is refused too.
  const root = fakeLinkedRoot(null);
  mkdirSync(path.join(root, "supabase"), { recursive: true });
  writeFileSync(path.join(root, "supabase", "production-project-refs.txt"), `${NEW_REGION_REF}\n`);
  const merged = refsFile.withCommittedProductionRefs({ NEXT_PUBLIC_SUPABASE_URL: `https://${NEW_REGION_REF}.supabase.co` }, root);
  assert.equal(env.checkDevServerTarget(merged).action, "refuse");
});

test("next.config.ts runs the check only in the development-server phase, with the committed refs, and throws on refuse", () => {
  const config = read("next.config.ts");
  assert.match(config, /if \(phase === PHASE_DEVELOPMENT_SERVER\) \{\s*const check = checkDevServerTarget\(withCommittedProductionRefs\(process\.env, process\.cwd\(\)\)\);\s*if \(check\.action === "refuse"\) throw new Error\(check\.message\);/);
  assert.match(config, /export default function config\(phase: string\) \{/);
  assert.match(config, /return sentryWrappedConfig;/);
});
