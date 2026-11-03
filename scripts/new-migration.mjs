#!/usr/bin/env node
// Creates an empty migration whose version always sorts AFTER every existing
// one (scripts/lib/migration-version.mjs explains why: some migrations are
// future-dated and already applied, so `supabase migration new` would produce a
// version `supabase db push` refuses). Local file only; touches no database.
//
// Run: npm run migration:new -- <name_in_snake_case>
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextMigrationVersion } from "./lib/migration-version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error("Usage: npm run migration:new -- <name_in_snake_case>  (lowercase letters, digits, underscores)");
  process.exit(1);
}

const version = nextMigrationVersion(readdirSync(DIR));
const file = path.join(DIR, `${version}_${name}.sql`);
if (existsSync(file)) {
  console.error(`Refusing to overwrite ${path.relative(ROOT, file)}`);
  process.exit(1);
}
writeFileSync(file, `-- ${name}\n`);
console.log(`Created ${path.relative(ROOT, file)}`);
