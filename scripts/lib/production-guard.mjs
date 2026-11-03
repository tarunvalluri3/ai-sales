#!/usr/bin/env node
/**
 * Stops a script or test run that would touch the PRODUCTION Supabase project
 * (LAUNCH_AUDIT.md §3, blocker B1: `.env.local` and the Supabase CLI link both
 * pointed at production, so `npm test`, seeds and one-off scripts all ran
 * against real customer data).
 *
 * What counts as production is decided by lib/deployment-env.ts -- the same
 * file the app uses at startup -- so the two can never disagree. A target is
 * production when its project ref is the built-in production ref or is listed
 * in PRODUCTION_SUPABASE_PROJECT_REFS. Two targets are checked:
 *   - NEXT_PUBLIC_SUPABASE_URL (anything using supabase-js), and
 *   - optionally the Supabase CLI link, supabase/.temp/project-ref (anything
 *     using `supabase db query --linked`, i.e. the pgTAP runner).
 *
 * Tests never get an override. A few operational scripts legitimately run
 * against production (issuing a credit note, enabling Instagram for one
 * business); they pass `allowOverride: true`, and then the run still refuses
 * unless the operator types BOTH `--allow-production` and
 * `--confirm-production-ref=<the exact ref>` -- so it can't happen by habit.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { supabaseProjectRefFromUrl, isProductionSupabaseRef } = await import(
  new URL("../../lib/deployment-env.ts", import.meta.url).href
);

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class ProductionTargetError extends Error {}

/** The project ref the Supabase CLI is linked to, or null when it isn't linked. */
export function linkedSupabaseRef(root = DEFAULT_ROOT) {
  const file = path.join(root, "supabase", ".temp", "project-ref");
  if (!existsSync(file)) return null;
  const ref = readFileSync(file, "utf8").trim();
  return ref.length > 0 ? ref : null;
}

/**
 * Pure: which configured targets are production. `linkedRef` is only
 * considered when `checkLinkedProject` is true.
 */
export function evaluateSupabaseTarget({ env, linkedRef = null, checkLinkedProject = false }) {
  const targets = [];
  const urlRef = supabaseProjectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (urlRef) targets.push({ source: "NEXT_PUBLIC_SUPABASE_URL", ref: urlRef, production: isProductionSupabaseRef(urlRef, env) });
  if (checkLinkedProject && linkedRef) {
    targets.push({ source: "supabase CLI link (supabase/.temp/project-ref)", ref: linkedRef, production: isProductionSupabaseRef(linkedRef, env) });
  }
  return { production: targets.some((target) => target.production), targets };
}

/** Pure: did the operator explicitly confirm every production ref this run would touch? */
export function hasProductionOverride(argv, productionRefs) {
  if (!argv.includes("--allow-production")) return false;
  const confirmed = argv
    .filter((arg) => arg.startsWith("--confirm-production-ref="))
    .map((arg) => arg.slice("--confirm-production-ref=".length).trim().toLowerCase());
  return productionRefs.length > 0 && productionRefs.every((ref) => confirmed.includes(ref.toLowerCase()));
}

/**
 * Throws ProductionTargetError when the run targets production and is not
 * explicitly overridden. Returns the evaluation otherwise.
 */
export function checkNotProductionTarget({
  scriptName,
  env = process.env,
  argv = process.argv.slice(2),
  checkLinkedProject = false,
  allowOverride = false,
  root = DEFAULT_ROOT,
}) {
  const linkedRef = checkLinkedProject ? linkedSupabaseRef(root) : null;
  const evaluation = evaluateSupabaseTarget({ env, linkedRef, checkLinkedProject });
  if (!evaluation.production) return { ...evaluation, overridden: false };

  const productionTargets = evaluation.targets.filter((target) => target.production);
  const productionRefs = [...new Set(productionTargets.map((target) => target.ref))];

  if (allowOverride && hasProductionOverride(argv, productionRefs)) {
    return { ...evaluation, overridden: true };
  }

  const where = productionTargets.map((target) => `  - ${target.source}: ${target.ref}`).join("\n");
  const how = allowOverride
    ? `If you really mean to run ${scriptName} against production, re-run with:\n  --allow-production --confirm-production-ref=${productionRefs.join(" --confirm-production-ref=")}`
    : `${scriptName} never runs against production. Point it at the staging project instead ` +
      "(staging NEXT_PUBLIC_SUPABASE_URL / `npx supabase link --project-ref <staging ref>`).";
  throw new ProductionTargetError(`Refusing to run ${scriptName}: it targets the PRODUCTION Supabase project.\n${where}\n${how}`);
}

/** Script-friendly wrapper: prints the refusal and exits with code 1. */
export function guardAgainstProduction(options) {
  try {
    const result = checkNotProductionTarget(options);
    if (result.overridden) {
      console.warn(`\n!!! ${options.scriptName} is running against PRODUCTION (explicitly confirmed). !!!\n`);
    }
    return result;
  } catch (error) {
    if (error instanceof ProductionTargetError) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

/** True for the guard's own flags, so a script's argument parser can skip them. */
export function isProductionGuardFlag(token) {
  return token === "--allow-production" || token.startsWith("--confirm-production-ref=");
}
