#!/usr/bin/env node
/**
 * Shared "don't accidentally spend real Gemini tokens" guard for scripts
 * that call the real Gemini API directly, or hit a running app (/api/chat)
 * whose own GEMINI_API_KEY may be the production one. Built for the
 * token-burn audit (STATE.md, 2026-10-28) and backed by the standing rule
 * in CLAUDE.md: never run these scripts against the live Gemini API or
 * production Supabase without asking the user first, with an estimated
 * call count.
 *
 * This project currently has exactly ONE configured Supabase project and,
 * until GEMINI_API_KEY_DEV is set up (.env.example), ONE Gemini key -- so
 * there is no separate "staging" project/key this guard could compare a
 * URL or key against to tell dev apart from production. Until that
 * separation exists, this guard treats ANY of the following as hitting
 * production and requires --allow-prod:
 *   - GEMINI_API_KEY_DEV is not set (so any direct Gemini call uses the
 *     one real key, which is the production key)
 *   - the script's APP_URL/EVAL_APP_URL points anywhere other than
 *     localhost/127.0.0.1 (a remote server's own Gemini key -- almost
 *     certainly production -- is what actually gets spent, not anything
 *     in this script's own environment)
 * Once a real dev project/key exists, extend `describeTarget()` below to
 * recognize it and skip the --allow-prod requirement for a genuine dev run.
 */

import readline from "node:readline/promises";

function isLocalUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/** True if this process has no dev Gemini key, so any direct call it makes uses the production one. */
export function usingProductionGeminiKey() {
  return !process.env.GEMINI_API_KEY_DEV;
}

/** Prefer the dev key once it exists (lib/env.ts does the same for the app itself once item 3 lands). */
export function resolveGeminiKey() {
  return process.env.GEMINI_API_KEY_DEV || process.env.GEMINI_API_KEY;
}

export function describeTarget(appUrl) {
  const remote = appUrl ? !isLocalUrl(appUrl) : false;
  const parts = [];
  if (appUrl) {
    parts.push(
      remote
        ? `a non-local APP_URL (${appUrl} -- that server's own Gemini key, almost certainly production, is what actually gets spent)`
        : `a local dev server (${appUrl})`,
    );
  }
  parts.push(
    usingProductionGeminiKey()
      ? "GEMINI_API_KEY (no GEMINI_API_KEY_DEV is set -- this IS the production key)"
      : "GEMINI_API_KEY_DEV",
  );
  return { remote, description: parts.join(" and "), isProd: remote || usingProductionGeminiKey() };
}

/**
 * Call near the top of a script's main(), once the real call count is
 * known (case count x expected calls per case -- account for streaming's
 * concurrent metadata call, the retrieval embedding call, and up to
 * MAX_TOOL_ITERATIONS (4) tool-loop iterations; see lib/rag.ts). Exits the
 * process (code 1) without running anything if the run isn't confirmed.
 */
export async function requireProdConfirmation({ scriptName, appUrl, estimateLine }) {
  const args = process.argv.slice(2);
  const allowProd = args.includes("--allow-prod");
  const autoYes = args.includes("--yes");
  const { description, isProd } = describeTarget(appUrl);

  if (isProd && !allowProd) {
    console.error(
      `\n${scriptName} is about to call the real Gemini API against ${description}.\n` +
        "Refusing to run without --allow-prod. Per CLAUDE.md: ask the user first, stating the " +
        "estimated number of API calls, before running this.\n",
    );
    process.exit(1);
  }

  console.log(`\n${scriptName}: target is ${description}.`);
  console.log(estimateLine);

  if (autoYes) {
    console.log("--yes passed, continuing without an interactive prompt.\n");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Continue? [y/N] ");
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(1);
  }
  console.log();
}
