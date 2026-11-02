// Shared by the hand-run admin scripts (instagram-access.mjs,
// seed-review-demo.mjs): resolves "the business owned by this email" and
// creates the service-role Supabase client. Plain Node, no app imports.
//
// "Owned by" = the email's Clerk user is an org:admin of the Clerk
// organization the business belongs to (businesses.clerk_org_id). Looked up
// through Clerk's Backend API with CLERK_SECRET_KEY, never from anything the
// user typed except the email itself. Secrets are read from env and never
// printed.
import { createClient } from "@supabase/supabase-js";

export const PRODUCTION_SUPABASE_REF = "bykeztxvejpwfcxgsubm";

export class ScriptExit extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export function requireEnv(names, npmScript) {
  for (const name of names) {
    if (!process.env[name]) {
      throw new ScriptExit(`${name} is not set. Run through "npm run ${npmScript}" so .env.local is loaded.`);
    }
  }
}

/** `--email a@b.c --org org_123` style flags. Unknown flags are refused. */
export function parseFlags(argv, allowed) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const name = token.startsWith("--") ? token.slice(2) : null;
    if (!name || !allowed.includes(name)) throw new ScriptExit(`Unknown argument: ${token}`, 2);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new ScriptExit(`--${name} needs a value`, 2);
    values[name] = value;
  }
  return values;
}

export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ScriptExit(`Not a valid email address: ${raw ?? ""}`, 2);
  return email;
}

export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function describeSupabaseTarget() {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  return `${ref}${ref === PRODUCTION_SUPABASE_REF ? "  (PRODUCTION)" : ""}`;
}

async function clerkGet(path) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!response.ok) {
    throw new ScriptExit(`Clerk API ${path.split("?")[0]} responded with status ${response.status}.`);
  }
  return response.json();
}

/**
 * The one business this email owns. Refuses (never guesses) when the email
 * matches no Clerk user, owns no business, or owns several and `orgId` was
 * not given to pick one.
 */
export async function findBusinessOwnedBy(supabase, email, orgId) {
  const users = await clerkGet(`/users?email_address=${encodeURIComponent(email)}&limit=10`);
  if (!Array.isArray(users) || users.length === 0) {
    throw new ScriptExit(`No Clerk user has the email ${email}. Check the address the owner signs in with.`);
  }
  if (users.length > 1) {
    throw new ScriptExit(`More than one Clerk user has the email ${email}; refusing to guess.`);
  }
  const user = users[0];

  const memberships = await clerkGet(`/users/${encodeURIComponent(user.id)}/organization_memberships?limit=100`);
  const adminOrgIds = (memberships?.data ?? [])
    .filter((membership) => membership.role === "org:admin" && membership.organization?.id)
    .map((membership) => membership.organization.id);
  if (adminOrgIds.length === 0) {
    throw new ScriptExit(`${email} is not an admin of any organization, so it owns no business.`);
  }

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, clerk_org_id, instagram_enabled, deleted_at")
    .in("clerk_org_id", adminOrgIds)
    .is("deleted_at", null);
  if (error) throw new ScriptExit("Could not read businesses from Supabase.");

  const candidates = orgId ? businesses.filter((business) => business.clerk_org_id === orgId) : businesses;
  if (candidates.length === 0) {
    throw new ScriptExit(
      orgId
        ? `${email} is not an admin of a business in organization ${orgId}.`
        : `${email} is an admin of ${adminOrgIds.length} organization(s), but none has a business yet (finish sign-up first).`,
    );
  }
  if (candidates.length > 1) {
    const list = candidates.map((business) => `  --org ${business.clerk_org_id}   ${business.name}`).join("\n");
    throw new ScriptExit(`${email} owns more than one business. Re-run with one of:\n${list}`, 2);
  }
  return candidates[0];
}

/** Runs `main`, printing a ScriptExit's message and setting the exit code without process.exit() (libuv assertion on Windows). */
export async function runScript(main, usage) {
  try {
    await main();
  } catch (error) {
    if (error instanceof ScriptExit) {
      console.error(`\n${error.message}\n`);
      if (error.code === 2 && usage) console.error(usage);
      process.exitCode = error.code;
      return;
    }
    console.error("\nUnexpected error:", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
  }
}
