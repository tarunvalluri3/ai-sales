// Switches the per-business Instagram override (businesses.instagram_enabled,
// migration 20261113000000) on or off for the business owned by an email.
// A hand-run admin script -- there is deliberately no admin UI for this.
//
//   npm run instagram:enable  -- --email owner@example.com [--org org_xxx]
//   npm run instagram:disable -- --email owner@example.com [--org org_xxx]
//
// Uses SUPABASE_SECRET_KEY (service role) and CLERK_SECRET_KEY from
// .env.local; prints which Supabase project it acts on, never a secret.
// Instagram is allowed when the plan includes it OR this flag is true, so
// `disable` only removes the override -- it never takes away a plan's channel.
import {
  createServiceClient,
  describeSupabaseTarget,
  findBusinessOwnedBy,
  normalizeEmail,
  parseFlags,
  requireEnv,
  runScript,
  ScriptExit,
} from "./lib/owner-business.mjs";

const USAGE = `Usage:
  npm run instagram:enable  -- --email <owner email> [--org <clerk org id>]
  npm run instagram:disable -- --email <owner email> [--org <clerk org id>]`;

await runScript(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode !== "enable" && mode !== "disable") throw new ScriptExit("First argument must be enable or disable.", 2);
  const flags = parseFlags(rest, ["email", "org"]);
  if (!flags.email) throw new ScriptExit("--email is required.", 2);
  const email = normalizeEmail(flags.email);
  const npmScript = `instagram:${mode}`;
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "CLERK_SECRET_KEY"], npmScript);

  console.log(`Supabase project: ${describeSupabaseTarget()}`);

  const supabase = createServiceClient();
  const business = await findBusinessOwnedBy(supabase, email, flags.org);
  const enabled = mode === "enable";

  const { data, error } = await supabase
    .from("businesses")
    .update({ instagram_enabled: enabled })
    .eq("id", business.id)
    .select("name, instagram_enabled")
    .single();
  if (error || !data) throw new ScriptExit("Could not update the business (is migration 20261113000000 applied?).");

  console.log(`Business:          ${data.name}`);
  console.log(`instagram_enabled: ${business.instagram_enabled} -> ${data.instagram_enabled}`);
}, USAGE);
