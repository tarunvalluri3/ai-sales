import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The committed list of production Supabase refs (supabase/production-project-refs.txt).
 * Node-only (reads a file): used by next.config.ts (the local `next dev` block)
 * and scripts/lib/production-guard.mjs. NOT imported by app runtime code, which
 * uses lib/deployment-env.ts's built-in ref + PRODUCTION_SUPABASE_PROJECT_REFS.
 */
export const PRODUCTION_REFS_FILE = path.join("supabase", "production-project-refs.txt");

/** Pure: refs from the file's text. Comments and blank lines ignored; anything that isn't a 20-char ref is dropped. */
export function parseProductionRefs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim().toLowerCase())
    .filter((line) => /^[a-z0-9]{20}$/.test(line));
}

export function readCommittedProductionRefs(root: string): string[] {
  const file = path.join(root, PRODUCTION_REFS_FILE);
  if (!existsSync(file)) return [];
  return parseProductionRefs(readFileSync(file, "utf8"));
}

/** The env with the committed refs merged into PRODUCTION_SUPABASE_PROJECT_REFS (they only ever add). */
export function withCommittedProductionRefs(
  env: Record<string, string | undefined>,
  root: string,
): Record<string, string | undefined> {
  const committed = readCommittedProductionRefs(root);
  if (committed.length === 0) return env;
  const existing = env.PRODUCTION_SUPABASE_PROJECT_REFS?.trim();
  return { ...env, PRODUCTION_SUPABASE_PROJECT_REFS: [existing, ...committed].filter(Boolean).join(",") };
}
