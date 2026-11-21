import { z } from "zod";

/**
 * Which version the dashboard test chat talks to. Lives here, NOT in the
 * "use server" actions file: Next.js refuses to load a "use server" module
 * that exports anything but async functions, so exporting this schema from
 * actions.ts made every sendSandboxMessage call 500 (production, 2026-11-21).
 * Pure (no server-only import) so the client panel and the unit tests can
 * import it.
 */
export const sandboxModeSchema = z.enum(["draft", "live"]);
export type SandboxMode = z.infer<typeof sandboxModeSchema>;

/**
 * Live testing needs retrieval over the published snapshot, i.e.
 * match_live_knowledge_chunks, which is granted to service_role only (not
 * `authenticated`), so it cannot run through the Clerk-session client the
 * sandbox uses. Until a migration grants it (or the sandbox gets a vetted
 * server-side path), Live stays off in the UI and refused by the action.
 */
export const LIVE_SANDBOX_ENABLED = false;

export const LIVE_SANDBOX_UNAVAILABLE_MESSAGE = "Live testing is coming soon. Draft uses your current setup.";
