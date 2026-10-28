import "server-only";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";

/**
 * Phase 33 (docs/phases.md), approved amendment 2: rate limiting on admin
 * mutations and PII reveals, keyed on the acting platform admin's Clerk
 * user_id (not an IP -- an admin session is always identified). Both
 * scopes are enforcing (20261102000200_add_admin_rate_limit_scopes.sql),
 * so a limit trip genuinely blocks the action.
 */
const ADMIN_MUTATION_LIMIT = { limit: 60, windowSeconds: 300 };
const ADMIN_PII_REVEAL_LIMIT = { limit: 30, windowSeconds: 300 };

export async function checkAdminMutationRateLimit(actorUserId: string): Promise<boolean> {
  return checkAndIncrementRateLimit(
    "admin_mutation",
    actorUserId,
    ADMIN_MUTATION_LIMIT.limit,
    ADMIN_MUTATION_LIMIT.windowSeconds,
    "platform",
  );
}

export async function checkAdminPiiRevealRateLimit(actorUserId: string): Promise<boolean> {
  return checkAndIncrementRateLimit(
    "admin_pii_reveal",
    actorUserId,
    ADMIN_PII_REVEAL_LIMIT.limit,
    ADMIN_PII_REVEAL_LIMIT.windowSeconds,
    "platform",
  );
}
