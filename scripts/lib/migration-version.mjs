/**
 * Migration version ordering (production readiness item 5, 2026-11-03).
 *
 * Several migrations are dated in the future (up to 20261123000000 at the time
 * of writing), and some of them are already applied in production. A migration
 * made with `supabase migration new` takes the CURRENT time, so it would sort
 * BEFORE those, and `supabase db push` (CI on staging, and the manual production
 * promotion) refuses a local migration that sorts before the last one applied
 * remotely, unless --include-all is used, which applies it out of order.
 *
 * Fix without renaming anything (an applied migration must never be renamed):
 * new migrations get max(now, newest existing + 1 minute). Once real time passes
 * the newest file, this is just "now" again. Pure helpers here; the CLI is
 * scripts/new-migration.mjs (`npm run migration:new -- <name>`).
 */

const VERSION = /^(\d{14})_[a-z0-9_]+\.sql$/;

/** The 14-digit version of a migration file name, or null. */
export function migrationVersion(fileName) {
  const match = VERSION.exec(fileName);
  return match ? match[1] : null;
}

/** 20261123000000 -> Date (UTC). */
export function versionToDate(version) {
  const y = Number(version.slice(0, 4));
  const mo = Number(version.slice(4, 6)) - 1;
  const d = Number(version.slice(6, 8));
  const h = Number(version.slice(8, 10));
  const mi = Number(version.slice(10, 12));
  const s = Number(version.slice(12, 14));
  return new Date(Date.UTC(y, mo, d, h, mi, s));
}

export function dateToVersion(date) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

/** The version for a new migration: now, or one minute after the newest existing one if that is later. */
export function nextMigrationVersion(existingFileNames, now = new Date()) {
  const versions = existingFileNames.map(migrationVersion).filter(Boolean).sort();
  const nowVersion = dateToVersion(now);
  const newest = versions.at(-1);
  if (!newest || nowVersion > newest) return nowVersion;
  return dateToVersion(new Date(versionToDate(newest).getTime() + 60_000));
}

/**
 * Problems with a migrations directory listing: bad names, duplicate versions.
 * (Ordering against what is already applied remotely is checked by
 * `migrationsAddedOutOfOrder` against the main branch's list.)
 */
export function migrationListProblems(fileNames) {
  const problems = [];
  const seen = new Map();
  for (const name of fileNames) {
    if (!name.endsWith(".sql")) continue;
    const version = migrationVersion(name);
    if (!version) {
      problems.push(`${name}: name must be <14-digit version>_<lowercase_name>.sql`);
      continue;
    }
    if (seen.has(version)) problems.push(`${name}: duplicate version ${version} (also ${seen.get(version)})`);
    else seen.set(version, name);
  }
  return problems;
}

/**
 * Migrations present on this branch but not on main that sort BEFORE main's
 * newest migration -- exactly what `supabase db push` would refuse.
 */
export function migrationsAddedOutOfOrder(branchFileNames, mainFileNames) {
  const onMain = new Set(mainFileNames);
  const mainNewest = mainFileNames.map(migrationVersion).filter(Boolean).sort().at(-1);
  if (!mainNewest) return [];
  return branchFileNames.filter((name) => !onMain.has(name) && (migrationVersion(name) ?? "") <= mainNewest);
}
