import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { servableFormatRefusal } from "@/lib/answer-bank/output-check";

/**
 * Dashboard-side access to stored instant answers. Runs under the owner's
 * Clerk session (RLS): the database enforces that only their own business's
 * rows are visible and editable, and the explicit business_id filters below
 * are the second layer. `businessId` must come from `requireBusinessContext()`.
 */

export type AnswerBankEntryView = {
  id: string;
  kind: "suggested" | "catalog";
  questionText: string;
  language: string;
  answer: string | null;
  status: "pending" | "ready" | "failed";
  ownerState: "generated" | "approved" | "edited";
  failureReason: string | null;
  /** Generated against the current content version -- i.e. servable right now. */
  fresh: boolean;
  generatedAt: string | null;
};

export type AnswerBankView = {
  published: boolean;
  currentVersion: number;
  entries: AnswerBankEntryView[];
  refreshQueued: boolean;
};

export const MAX_EDITED_ANSWER_CHARS = 1500;

type EntryRow = {
  id: string;
  kind: "suggested" | "catalog";
  question_text: string;
  language: string;
  answer: string | null;
  status: "pending" | "ready" | "failed";
  owner_state: "generated" | "approved" | "edited";
  content_version: number | string;
  failure_reason: string | null;
  generated_at: string | null;
};

async function currentVersionOf(businessId: string): Promise<{ version: number; published: boolean }> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("answer_bank_version, published_at")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !data) {
    throw new AppError("Something went wrong loading your instant answers. Please try again.", "currentVersionOf failed", error);
  }
  return { version: Number(data.answer_bank_version), published: data.published_at !== null };
}

export async function getAnswerBankView(businessId: string): Promise<AnswerBankView> {
  const supabase = createServerSupabaseClient();
  const [{ version, published }, entriesResult] = await Promise.all([
    currentVersionOf(businessId),
    supabase
      .from("answer_bank_entries")
      .select("id, kind, question_text, language, answer, status, owner_state, content_version, failure_reason, generated_at")
      .eq("business_id", businessId)
      .order("kind", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);
  if (entriesResult.error) {
    throw new AppError(
      "Something went wrong loading your instant answers. Please try again.",
      "getAnswerBankView failed",
      entriesResult.error,
    );
  }
  const entries = ((entriesResult.data ?? []) as EntryRow[]).map<AnswerBankEntryView>((row) => ({
    id: row.id,
    kind: row.kind,
    questionText: row.question_text,
    language: row.language,
    answer: row.answer,
    status: row.status,
    ownerState: row.owner_state,
    failureReason: row.failure_reason,
    fresh: row.status === "ready" && Number(row.content_version) === version,
    generatedAt: row.generated_at,
  }));
  return { published, currentVersion: version, entries, refreshQueued: false };
}

export type EntryEditResult = "ok" | "not_found" | "invalid" | "not_approvable";

/** Replaces the stored answer with the owner's own text. Stamps it with the current version, so it is live immediately and never overwritten by a regeneration. */
export async function saveEditedAnswer(businessId: string, entryId: string, rawAnswer: string): Promise<EntryEditResult> {
  const answer = rawAnswer.trim();
  if (answer.length === 0 || answer.length > MAX_EDITED_ANSWER_CHARS || servableFormatRefusal(answer)) return "invalid";
  const { version } = await currentVersionOf(businessId);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("answer_bank_entries")
    .update({
      answer,
      owner_state: "edited",
      status: "ready",
      content_version: version,
      approved_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("business_id", businessId)
    .eq("id", entryId)
    .select("id");
  if (error) {
    throw new AppError("Something went wrong saving this answer. Please try again.", "saveEditedAnswer failed", error);
  }
  return data && data.length > 0 ? "ok" : "not_found";
}

/**
 * Marks an answer as reviewed. Allowed only for an answer that is live now
 * (fresh) or an owner-edited answer parked for review after the content
 * changed -- never for a stale generated answer, which would re-stamp text
 * written against old prices as current. Those regenerate on their own.
 */
export async function approveAnswer(businessId: string, entryId: string): Promise<EntryEditResult> {
  const { version } = await currentVersionOf(businessId);
  const supabase = createServerSupabaseClient();
  const { data: row, error: readError } = await supabase
    .from("answer_bank_entries")
    .select("id, answer, status, owner_state, content_version, failure_reason")
    .eq("business_id", businessId)
    .eq("id", entryId)
    .maybeSingle();
  if (readError) {
    throw new AppError("Something went wrong approving this answer. Please try again.", "approveAnswer read failed", readError);
  }
  if (!row) return "not_found";
  const isFresh = row.status === "ready" && Number(row.content_version) === version;
  const isParkedEdit = row.status === "pending" && row.failure_reason === "edited_answer_needs_review" && !!row.answer;
  if (!isFresh && !isParkedEdit) return "not_approvable";

  const { error } = await supabase
    .from("answer_bank_entries")
    .update({
      owner_state: isParkedEdit || row.owner_state === "edited" ? "edited" : "approved",
      status: "ready",
      content_version: version,
      approved_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("business_id", businessId)
    .eq("id", entryId);
  if (error) {
    throw new AppError("Something went wrong approving this answer. Please try again.", "approveAnswer failed", error);
  }
  return "ok";
}
