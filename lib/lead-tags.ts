import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LeadTag, TagColor } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

const UNIQUE_VIOLATION = "23505";

/** Lists a business's full tag catalog, alphabetical. `businessId` must come from `requireBusinessContext()`. */
export async function listTagsForBusiness(businessId: string): Promise<LeadTag[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tags")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("Something went wrong loading tags. Please try again.", "listTagsForBusiness failed", error);
  }

  return data;
}

/** Creates a tag in the business's catalog. Throws a friendly, specific message on a duplicate name (case-insensitive), since that's the one failure mode a user can actually act on. */
export async function createTag(businessId: string, name: string, color: TagColor): Promise<LeadTag> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tags")
    .insert({ business_id: businessId, name, color })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A tag with this name already exists.", "createTag duplicate name", error);
    }
    throw new AppError("Something went wrong creating this tag. Please try again.", "createTag failed", error);
  }

  return data;
}

/**
 * Finds an existing tag by case-insensitive exact name match, or creates
 * one (default color) if none exists -- used only by the AI-suggested-
 * tag accept flow, where a suggestion may or may not already match a
 * real catalog entry (see `lib/tag-suggestions.ts`'s own doc comment on
 * why the prompt nudges toward reuse without guaranteeing it). Handles
 * the race where two suggestions resolving to the same new name are
 * accepted at nearly the same time: the insert's unique-violation is
 * treated as "someone just created it," not an error -- re-fetches and
 * returns that row instead of surfacing a "duplicate name" failure for
 * an action the user experiences as idempotent ("accept this tag").
 */
export async function getOrCreateTagByName(businessId: string, name: string): Promise<LeadTag> {
  const trimmed = name.trim();
  const existing = await listTagsForBusiness(businessId);
  const match = existing.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tags")
    .insert({ business_id: businessId, name: trimmed, color: "accent" })
    .select()
    .single();

  if (!error) return data;

  if (error.code === UNIQUE_VIOLATION) {
    const retry = await listTagsForBusiness(businessId);
    const retryMatch = retry.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
    if (retryMatch) return retryMatch;
  }

  throw new AppError("Something went wrong adding this tag. Please try again.", "getOrCreateTagByName failed", error);
}

/** Renames/recolors a tag. Returns `false` (not an error) if `id` doesn't belong to `businessId` -- same "affected zero rows" contract as `lib/leads.ts`'s `updateLeadStatus`. */
export async function updateTag(businessId: string, id: string, name: string, color: TagColor): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tags")
    .update({ name, color })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A tag with this name already exists.", "updateTag duplicate name", error);
    }
    throw new AppError("Something went wrong updating this tag. Please try again.", "updateTag failed", error);
  }

  return data.length > 0;
}

/** Deletes a tag from the catalog -- cascades to every `lead_tag_assignments`/`conversation_tag_assignments` row referencing it (the migration's `on delete cascade`), so it disappears from every lead/conversation it was ever applied to. Returns `false` if `id` doesn't belong to `businessId`. */
export async function deleteTag(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tags")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong deleting this tag. Please try again.", "deleteTag failed", error);
  }

  return data.length > 0;
}

/** Batched lookup for a page rendering many leads at once (avoids one query per row). Keys only leads that actually have at least one tag. */
export async function listTagsForLeads(
  businessId: string,
  leadIds: string[],
): Promise<Record<string, LeadTag[]>> {
  if (leadIds.length === 0) return {};

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_tag_assignments")
    .select("lead_id, lead_tags(id, business_id, name, color, created_at)")
    .eq("business_id", businessId)
    .in("lead_id", leadIds);

  if (error) {
    throw new AppError("Something went wrong loading tags. Please try again.", "listTagsForLeads failed", error);
  }

  const byLeadId: Record<string, LeadTag[]> = {};
  for (const row of data) {
    const tag = row.lead_tags as unknown as LeadTag | null;
    if (!tag) continue;
    (byLeadId[row.lead_id] ??= []).push(tag);
  }
  return byLeadId;
}

/** Same shape as `listTagsForLeads`, for one conversation. */
export async function listTagsForConversation(businessId: string, conversationId: string): Promise<LeadTag[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("conversation_tag_assignments")
    .select("lead_tags(id, business_id, name, color, created_at)")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId);

  if (error) {
    throw new AppError(
      "Something went wrong loading tags. Please try again.",
      "listTagsForConversation failed",
      error,
    );
  }

  return data.map((row) => row.lead_tags as unknown as LeadTag).filter((tag): tag is LeadTag => tag !== null);
}

/**
 * Assigns an existing catalog tag to a lead. Idempotent -- assigning a
 * tag that's already applied is treated as success, not an error (the
 * unique (lead_id, tag_id) constraint is what a double-click/race would
 * hit). The RLS policy's own `with check` (see the migration) is what
 * actually rejects a forged cross-tenant lead_id/tag_id pair; a mismatch
 * surfaces here as a generic Postgres RLS-violation error, translated to
 * the same safe message as any other failure.
 */
export async function assignTagToLead(businessId: string, leadId: string, tagId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("lead_tag_assignments")
    .insert({ business_id: businessId, lead_id: leadId, tag_id: tagId });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new AppError("Something went wrong adding this tag. Please try again.", "assignTagToLead failed", error);
  }
}

/** Removes a tag from a lead. Silently a no-op if the assignment doesn't exist (removing something already removed isn't an error). */
export async function removeTagFromLead(businessId: string, leadId: string, tagId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("lead_tag_assignments")
    .delete()
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .eq("tag_id", tagId);

  if (error) {
    throw new AppError(
      "Something went wrong removing this tag. Please try again.",
      "removeTagFromLead failed",
      error,
    );
  }
}

/** Same contract as `assignTagToLead`, for a conversation. */
export async function assignTagToConversation(
  businessId: string,
  conversationId: string,
  tagId: string,
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("conversation_tag_assignments")
    .insert({ business_id: businessId, conversation_id: conversationId, tag_id: tagId });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new AppError(
      "Something went wrong adding this tag. Please try again.",
      "assignTagToConversation failed",
      error,
    );
  }
}

/** Same contract as `removeTagFromLead`, for a conversation. */
export async function removeTagFromConversation(
  businessId: string,
  conversationId: string,
  tagId: string,
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("conversation_tag_assignments")
    .delete()
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("tag_id", tagId);

  if (error) {
    throw new AppError(
      "Something went wrong removing this tag. Please try again.",
      "removeTagFromConversation failed",
      error,
    );
  }
}
