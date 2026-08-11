import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

/**
 * Signals that a business already exists for this org — an idempotent
 * outcome for a duplicate create attempt, not a user-facing failure.
 */
export class BusinessAlreadyExistsError extends Error {
  constructor() {
    super("A business already exists for this organization.");
    this.name = "BusinessAlreadyExistsError";
  }
}

/**
 * Looks up the business row for a given Clerk org. `orgId` must come from
 * a validated session (`requireAuthContext()`), never from client input.
 * The explicit `clerk_org_id` filter is defense in depth alongside RLS.
 */
export async function getBusinessForOrg(orgId: string): Promise<Business | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading your business. Please try again.",
      "getBusinessForOrg failed",
      error,
    );
  }

  return data;
}

/**
 * Creates the business row for a given Clerk org. `orgId` must come from
 * a validated session, never from client input.
 */
export async function createBusinessForOrg(
  orgId: string,
  name: string,
): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .insert({ clerk_org_id: orgId, name })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new BusinessAlreadyExistsError();
    }

    throw new AppError(
      "Something went wrong creating your business. Please try again.",
      "createBusinessForOrg failed",
      error,
    );
  }

  return data;
}
