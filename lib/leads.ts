import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Lead, LeadQualification, LeadStatus } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import type { LeadPersistInput } from "@/lib/schemas/lead";
import { scoreLead } from "@/lib/lead-scoring";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/** Bounds the unpaginated leads-list fetch (dashboard's leads page and the conversations layout both just need "most recent N", never every lead a business has ever had), same reasoning and value as lib/conversations.ts's LIST_LIMIT. */
const LIST_LIMIT = 300;

/** Creates a lead for a business. `businessId` must come from `requireBusinessContext()`. Input must already be validated (`leadPersistSchema`). */
export async function createLead(
  businessId: string,
  conversationId: string,
  input: LeadPersistInput,
): Promise<Lead> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      interest_type: input.interestType,
      interest_id: input.interestId,
      notes: input.notes,
      qualification: input.qualification,
      qualification_reason: input.qualificationReason,
      source: input.source,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving this lead. Please try again.",
      "createLead failed",
      error,
    );
  }

  return data;
}

/** Lists all leads for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listLeadsForBusiness(businessId: string): Promise<Lead[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new AppError(
      "Something went wrong loading your leads. Please try again.",
      "listLeadsForBusiness failed",
      error,
    );
  }

  return data;
}

/**
 * Looks up the lead associated with a conversation, scoped to the given
 * business. `null` if the conversation has no lead (the common case --
 * most conversations don't produce one, per Phase 10's "no contact info
 * -> no lead row" rule). Constructs its own client internally, matching
 * this file's existing convention -- not lib/conversations.ts's/
 * lib/messages.ts's client-injection pattern, since lead capture has no
 * service-role caller today (Phase 11 Decision 16).
 */
export async function getLeadForConversation(
  businessId: string,
  conversationId: string,
): Promise<Lead | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this conversation's lead. Please try again.",
      "getLeadForConversation failed",
      error,
    );
  }

  return data;
}

/**
 * Updates a lead's status, scoped to the given business. `id`s belonging
 * to another business (or nonexistent) affect zero rows -- returns
 * `false` rather than throwing, so the caller can show a safe "not
 * found" message without distinguishing that from a cross-tenant
 * attempt. Same contract as lib/products.ts's updateProduct().
 */
export async function updateLeadStatus(
  businessId: string,
  id: string,
  status: LeadStatus,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this lead. Please try again.",
      "updateLeadStatus failed",
      error,
    );
  }

  return data.length > 0;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Last-10-digit match key, tolerant of country-code/formatting differences -- an exact match is too strict across a typed number vs. a WhatsApp wa_id. */
function phoneMatchKey(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function emailMatchKey(email: string): string {
  return email.trim().toLowerCase();
}

export type PossibleDuplicateHint = { leadId: string; conversationId: string; channel: string | null };

/**
 * Cross-channel identity linking, user-requested (STATE.md, 2026-09-10),
 * scoped to a dashboard hint only -- no data is merged and
 * `leads.conversation_id` stays 1:1 per PRODUCT.md §8's resolved lead
 * spec. Groups leads sharing a normalized phone or email across
 * *different* conversations for the same business (the caller already
 * scoped `leads` to one business_id, so this never crosses a tenant
 * boundary). A false-positive match costs nothing beyond a
 * slightly-wrong note on the dashboard, so this deliberately favors
 * recall over strict precision.
 */
export function computePossibleDuplicateLeads(
  leads: Lead[],
  channelByConversationId: Record<string, string | null>,
): Record<string, PossibleDuplicateHint[]> {
  const byKey = new Map<string, Lead[]>();

  for (const lead of leads) {
    const keys: string[] = [];
    if (lead.contact_phone) {
      const key = phoneMatchKey(lead.contact_phone);
      if (key) keys.push(`phone:${key}`);
    }
    if (lead.contact_email) keys.push(`email:${emailMatchKey(lead.contact_email)}`);

    for (const key of keys) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(lead);
      else byKey.set(key, [lead]);
    }
  }

  const hintsByLeadId: Record<string, PossibleDuplicateHint[]> = {};

  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;
    for (const lead of bucket) {
      const others = bucket.filter((other) => other.conversation_id !== lead.conversation_id);
      if (others.length === 0) continue;
      const existing = hintsByLeadId[lead.id] ?? [];
      for (const other of others) {
        if (existing.some((hint) => hint.leadId === other.id)) continue;
        existing.push({
          leadId: other.id,
          conversationId: other.conversation_id,
          channel: channelByConversationId[other.conversation_id] ?? null,
        });
      }
      hintsByLeadId[lead.id] = existing;
    }
  }

  return hintsByLeadId;
}

/**
 * Same contract as updateLeadStatus(), batched into one query for the
 * leads-list bulk toolbar instead of N sequential round-trips. Ids
 * belonging to another business are simply excluded by the `business_id`
 * filter -- the returned count only reflects rows actually updated, so a
 * caller can tell the difference between "everything applied" and
 * "some ids didn't match" without a separate lookup.
 */
export async function updateLeadStatusBulk(
  businessId: string,
  ids: string[],
  status: LeadStatus,
): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("business_id", businessId)
    .in("id", ids)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating these leads. Please try again.",
      "updateLeadStatusBulk failed",
      error,
    );
  }

  return data.length;
}

const NOTES_MAX_LENGTH = 2000;

/** Shared by `upsertLeadForConversation` below -- appends new notes to a lead's existing notes, truncating to stay within the column's length budget rather than silently dropping the newest note. */
export function appendNotes(existing: string | null, addition: string | null): string | null {
  if (!addition) return existing;
  if (!existing) return addition.slice(0, NOTES_MAX_LENGTH);
  const combined = `${existing}\n\n${addition}`;
  if (combined.length <= NOTES_MAX_LENGTH) return combined;
  const budget = NOTES_MAX_LENGTH - existing.length - 2;
  if (budget <= 0) return existing.slice(0, NOTES_MAX_LENGTH);
  return `${existing}\n\n${addition.slice(0, budget)}`;
}

export type LeadUpsertInput = {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  requestedCallback: boolean;
  appointmentBooked: boolean;
  needsAttention: boolean;
  interestSpecified: boolean;
  source: string;
};

export type LeadUpsertResult =
  | { success: true; leadId: string; created: boolean; qualification: LeadQualification; qualificationReason: string }
  | { success: false };

/**
 * Creates or updates the lead tied to a conversation -- shared by
 * `request_callback` and `book_appointment` (lib/tools/*.ts), so a
 * prospect who does both in the same conversation upgrades one lead
 * instead of producing two, and qualification (lib/lead-scoring.ts) is
 * always computed the same way regardless of which tool triggered it.
 * `requestedCallback`/`appointmentBooked` are OR'd with whatever's
 * already persisted, so a lead correctly upgrades warm -> hot whichever
 * order the two happen in.
 *
 * Client-injected (unlike `createLead` above, which constructs its own
 * Clerk-session client internally and has no valid session on the
 * widget's service-role path -- the same bug class documented on
 * `executeRequestCallback`). `businessId`/`conversationId` must come
 * from the caller's own trusted parameters, never from model input.
 *
 * Never throws, unlike every other function in this file -- both
 * callers (request_callback, book_appointment) have their own
 * "never throws" contract and already log their own detailed
 * tool_invoked failure reasons, so a DB failure here comes back as
 * `{ success: false }` for the caller to handle the same way it handles
 * every other failure mode.
 */
export async function upsertLeadForConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  input: LeadUpsertInput,
): Promise<LeadUpsertResult> {
  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id, contact_name, contact_email, contact_phone, notes, requested_callback, appointment_booked")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (lookupError) {
    return { success: false };
  }

  const requestedCallback = (existing?.requested_callback ?? false) || input.requestedCallback;
  const appointmentBooked = (existing?.appointment_booked ?? false) || input.appointmentBooked;
  const contactEmail = existing?.contact_email ?? input.contactEmail;
  const contactPhone = existing?.contact_phone ?? input.contactPhone;

  const { qualification, reason: qualificationReason } = scoreLead({
    hasEmail: contactEmail !== null,
    hasPhone: contactPhone !== null,
    requestedCallback,
    appointmentBooked,
    needsAttention: input.needsAttention,
    interestSpecified: input.interestSpecified,
  });

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        requested_callback: requestedCallback,
        appointment_booked: appointmentBooked,
        contact_name: existing.contact_name ?? input.contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        notes: appendNotes(existing.notes, input.notes),
        qualification,
        qualification_reason: qualificationReason,
      })
      .eq("id", existing.id)
      .eq("business_id", businessId)
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      return { success: false };
    }

    return { success: true, leadId: existing.id, created: false, qualification, qualificationReason };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      interest_type: null,
      interest_id: null,
      notes: input.notes,
      qualification,
      qualification_reason: qualificationReason,
      source: input.source,
      requested_callback: requestedCallback,
      appointment_booked: appointmentBooked,
    })
    .select("id")
    .single();

  if (insertError) {
    return { success: false };
  }

  return { success: true, leadId: inserted.id, created: true, qualification, qualificationReason };
}
