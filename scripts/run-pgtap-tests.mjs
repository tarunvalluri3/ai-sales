#!/usr/bin/env node
/**
 * Runs every pgTAP file under supabase/tests/database/ against the live,
 * linked Supabase project (Phase 19b, docs/phase-19-audit-findings.md §9).
 *
 * Deliberately NOT `supabase test db` -- that command only runs against a
 * local Docker-backed Supabase stack, which is unavailable in both this
 * project's implementing environment and the user's own machine. Each
 * file is run individually via `supabase db query --linked --file`,
 * which executes the whole file as one connection/session, so the
 * file's own `begin;`/`rollback;` genuinely bounds one transaction --
 * verified live before this script was written (no fixture rows
 * persisted after a manual run).
 *
 * `supabase db query --file` returns only the LAST statement's result
 * set, not every statement's -- confirmed live. Every test file
 * therefore funnels every assertion's TAP line into a temporary table
 * and selects it all as its own final statement, so this script sees
 * every "ok"/"not ok" line, not just the last one.
 *
 * Requires the `supabase` CLI to already be authenticated (`supabase
 * login`) and linked (`supabase link`) to the target project -- this is
 * not currently CI-portable without also setting up a
 * SUPABASE_ACCESS_TOKEN-based non-interactive auth path (out of scope
 * for this phase; no CI exists yet for this project).
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "..", "supabase", "tests", "database");

function listTestFiles() {
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(testDir, name));
}

function runFile(filePath) {
  let stdout;
  try {
    // execFileSync on a bare argv array hit two dead ends, both confirmed
    // live: without shell:true, spawning npx's .cmd wrapper throws EINVAL
    // on Windows (Node's CVE-2024-27980 .cmd/.bat fix); with shell:true,
    // the array-of-args form isn't quoted correctly for a path containing
    // spaces, breaking the CLI's own argument parsing. execSync with one
    // manually-quoted command string is the combination that actually
    // works on both Windows and POSIX.
    // -o json is explicit, not relied on as a default: confirmed live that
    // a clean CI environment (no prior local CLI config) defaults to a
    // pretty-printed table instead of JSON, which broke parsing here.
    const command = `npx supabase db query --linked --file "${filePath}" -o json`;
    stdout = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return {
      passed: false,
      lines: [],
      error: `command failed: ${error.stderr || error.message}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { passed: false, lines: [], error: `could not parse CLI output as JSON: ${stdout.slice(0, 500)}` };
  }

  // Confirmed live: the CLI's -o json response shape differs by
  // environment/version -- a bare array of row objects in one
  // (observed in CI), an { rows: [...] } envelope in another (observed
  // locally). Accept either rather than assuming one.
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;

  if (!rows) {
    return { passed: false, lines: [], error: `unexpected response shape (no rows array): ${stdout.slice(0, 500)}` };
  }

  const lines = rows.map((row) => row.line ?? JSON.stringify(row));
  const hasFailure = lines.some((line) => typeof line === "string" && line.includes("not ok"));

  return { passed: !hasFailure, lines, error: null };
}

function main() {
  const files = listTestFiles();
  if (files.length === 0) {
    console.log("No pgTAP test files found under supabase/tests/database/.");
    process.exit(0);
  }

  console.log(`Running ${files.length} pgTAP file(s) against the live, linked Supabase project...\n`);

  let anyFailed = false;

  for (const filePath of files) {
    const name = path.basename(filePath);
    const result = runFile(filePath);

    if (result.error) {
      anyFailed = true;
      console.log(`FAIL  ${name}`);
      console.log(`      ${result.error}`);
      continue;
    }

    if (!result.passed) {
      anyFailed = true;
      console.log(`FAIL  ${name}`);
      for (const line of result.lines) {
        console.log(`      ${line}`);
      }
    } else {
      console.log(`PASS  ${name}  (${result.lines.length} assertion line(s))`);
    }
  }

  console.log("");
  if (anyFailed) {
    console.log("pgTAP suite: FAILED");
    process.exit(1);
  } else {
    console.log("pgTAP suite: all files passed");
    process.exit(0);
  }
}

main();
