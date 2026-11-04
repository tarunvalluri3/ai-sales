// Migration version ordering (production readiness item 5, 2026-11-03).
//   1. Pure: version parsing, next version = max(now, newest + 1 minute),
//      duplicate/bad-name detection, out-of-order detection against main.
//   2. The real directory: names valid, no duplicate versions.
//   3. Against main (when git can see a main branch): every migration this
//      branch ADDS sorts after main's newest one -- what `supabase db push`
//      would otherwise refuse. Skipped, with a note, if no main ref is
//      available (e.g. a shallow CI checkout).
//
// Run: npm run test:migration-order
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dateToVersion,
  migrationListProblems,
  migrationVersion,
  migrationsAddedOutOfOrder,
  nextMigrationVersion,
  versionToDate,
} from "./lib/migration-version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = readdirSync(path.join(ROOT, "supabase", "migrations")).filter((name) => name.endsWith(".sql"));

test("version parsing round-trips", () => {
  assert.equal(migrationVersion("20261123000000_chat_protection.sql"), "20261123000000");
  assert.equal(migrationVersion("2026112300000_short.sql"), null);
  assert.equal(migrationVersion("20261123000000_Bad-Name.sql"), null);
  assert.equal(dateToVersion(versionToDate("20261231235959")), "20261231235959");
});

test("next version: one minute after a future-dated newest file; plain 'now' once time has passed it", () => {
  const files = ["20261120000000_a.sql", "20261123000000_b.sql"];
  assert.equal(nextMigrationVersion(files, new Date("2026-11-03T10:00:00Z")), "20261123000100");
  assert.equal(nextMigrationVersion(["20261123235930_x.sql"], new Date("2026-11-03T10:00:00Z")), "20261124000030", "rolls over midnight");
  assert.equal(nextMigrationVersion(files, new Date("2026-12-01T08:30:15Z")), "20261201083015");
  assert.equal(nextMigrationVersion([], new Date("2026-11-03T10:00:00Z")), "20261103100000");
});

test("duplicate versions and bad names are reported", () => {
  assert.deepEqual(migrationListProblems(["20261101000000_a.sql", "20261102000000_b.sql"]), []);
  assert.equal(migrationListProblems(["20261101000000_a.sql", "20261101000000_b.sql"]).length, 1);
  assert.equal(migrationListProblems(["create_table.sql"]).length, 1);
});

test("a branch migration dated before main's newest is flagged; renamed-nothing branches are fine", () => {
  const main = ["20261113000000_x.sql", "20261114000000_y.sql"];
  assert.deepEqual(migrationsAddedOutOfOrder([...main, "20261103120000_today.sql"], main), ["20261103120000_today.sql"]);
  assert.deepEqual(migrationsAddedOutOfOrder([...main, "20261115000000_next.sql"], main), []);
  assert.deepEqual(migrationsAddedOutOfOrder(main, main), [], "existing (possibly applied) files are never flagged");
});

test("the real migrations directory: valid names, no duplicate versions", () => {
  assert.deepEqual(migrationListProblems(MIGRATIONS), []);
});

function mainMigrations() {
  for (const ref of ["origin/main", "main"]) {
    try {
      const out = execFileSync("git", ["ls-tree", "--name-only", `${ref}:supabase/migrations`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return { ref, files: out.split(/\r?\n/).filter((name) => name.endsWith(".sql")) };
    } catch {
      // try the next ref
    }
  }
  return null;
}

test("every migration this branch adds sorts after main's newest (what db push requires)", (t) => {
  const main = mainMigrations();
  if (!main) {
    t.skip("no main branch visible to git (shallow checkout); ordering against main not checked");
    return;
  }
  assert.deepEqual(
    migrationsAddedOutOfOrder(MIGRATIONS, main.files),
    [],
    `new migrations must sort after ${main.ref}'s newest; create them with npm run migration:new -- <name>`,
  );
});
