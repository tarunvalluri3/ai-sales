import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Appointment,
  AppointmentStatus,
  Conversation,
  Customer,
  Lead,
  LeadInterestType,
  LeadQualification,
  LeadStatus,
  LeadTag,
} from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { emailMatchKey, phoneMatchKey } from "@/lib/identity-keys";
import { assignTagToConversation, assignTagToLead, removeTagFromConversation, removeTagFromLead } from "@/lib/lead-tags";
import { listLeadScoreHistory } from "@/lib/lead-score-history";
import type { LeadScoreHistoryEntry } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/** Bounds the customer-list fetch, same reasoning/value as lib/leads.ts's/lib/conversations.ts's LIST_LIMIT. */
const LIST_LIMIT = 300;

/**
 * Finds or creates the customer identity a contact's email/phone
 * resolves to, for the given business (Phase 28). Deterministic and
 * conservative -- exact normalized email/phone key equality only, never
 * fuzzy matching (see lib/identity-keys.ts). Returns `null` when neither
 * an email nor a phone is given, since a customer requires at least one
 * matchable key (mirrors leads/appointments' own "contact info
 * required" rule -- this function is only ever called once that rule
 * has already been satisfied).
 *
 * Client-injected: the widget/AI-tool path (this function's only real
 * callers, via lib/leads.ts's upsertLeadForConversation and
 * lib/appointments.ts's createAppointment) has no Clerk session, so it
 * always runs under the service-role client there. Never throws --
 * customer linkage is a convenience on top of lead/appointment
 * persistence, not a correctness requirement for it.
 */
export async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  businessId: string,
  contact: { name: string | null; email: string | null; phone: string | null },
): Promise<string | null> {
  const emailKey = contact.email ? emailMatchKey(contact.email) : null;
  const phoneKey = contact.phone ? phoneMatchKey(contact.phone) : null;
  if (!emailKey && !phoneKey) return null;

  try {
    let existing: { id: string; display_name: string | null; email: string | null; phone: string | null } | null = null;

    if (emailKey) {
      const { data } = await supabase
        .from("customers")
        .select("id, display_name, email, phone")
        .eq("business_id", businessId)
        .eq("email_key", emailKey)
        .maybeSingle();
      existing = data;
    }
    if (!existing && phoneKey) {
      const { data } = await supabase
        .from("customers")
        .select("id, display_name, email, phone")
        .eq("business_id", businessId)
        .eq("phone_key", phoneKey)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      await supabase
        .from("customers")
        .update({
          display_name: existing.display_name ?? contact.name,
          email: existing.email ?? contact.email,
          phone: existing.phone ?? contact.phone,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("business_id", businessId);

      return existing.id;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("customers")
      .insert({
        business_id: businessId,
        display_name: contact.name,
        email: contact.email,
        phone: contact.phone,
      })
      .select("id")
      .single();

    if (!insertError) return inserted.id;

    // Unique-violation on (business_id, email_key)/(business_id, phone_key)
    // means a concurrent request just created the matching customer --
    // race-safe re-fetch, same pattern as lib/lead-tags.ts's getOrCreateTagByName.
    if (insertError.code === "23505") {
      const retry = emailKey
        ? await supabase.from("customers").select("id").eq("business_id", businessId).eq("email_key", emailKey).maybeSingle()
        : await supabase.from("customers").select("id").eq("business_id", businessId).eq("phone_key", phoneKey!).maybeSingle();
      return retry.data?.id ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/** Best-effort: links a conversation to a customer if it isn't linked already. Never throws. */
export async function linkConversationToCustomer(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  customerId: string,
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ customer_id: customerId })
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .is("customer_id", null);
}

/** Renames a customer's display name, scoped to the given business. `false` (not thrown) if `id` doesn't belong to `businessId`. */
export async function renameCustomer(businessId: string, id: string, displayName: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ display_name: displayName })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong renaming this customer. Please try again.", "renameCustomer failed", error);
  }

  return data.length > 0;
}

export type CustomerSummary = {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  firstSeenAt: string;
  lastActivityAt: string;
  latestLead: {
    id: string;
    score: number;
    qualification: LeadQualification;
    status: LeadStatus;
    interestType: LeadInterestType | null;
  } | null;
  latestChannel: string | null;
  needsAttention: boolean;
  humanControlled: boolean;
  conversationCount: number;
  appointmentCount: number;
  latestAppointmentStatus: AppointmentStatus | null;
  /** Phase 30 (Sales Copilot): the latest appointment's start time, when there is one -- lets the deterministic priority layer reason about "appointment tomorrow, unconfirmed" without a second query. */
  latestAppointmentStartsAt: string | null;
  tagNames: string[];
};

function latestByCreatedAt<T extends { created_at: string; customer_id: string | null }>(rows: T[]): Map<string, T> {
  const byCustomer = new Map<string, T>();
  for (const row of rows) {
    if (!row.customer_id) continue;
    const current = byCustomer.get(row.customer_id);
    if (!current || row.created_at > current.created_at) byCustomer.set(row.customer_id, row);
  }
  return byCustomer;
}

/**
 * Aggregated customer list for the dashboard's Customers page and for
 * segment evaluation (lib/segments.ts) -- a handful of bounded, scoped
 * queries joined in application code, not one large cross-table SQL
 * query. `businessId` must come from `requireBusinessContext()`.
 *
 * Known performance limitation, recorded rather than hidden: this
 * fetches up to LIST_LIMIT customers plus every lead/conversation/
 * appointment/tag-assignment for them per call. Fine at this project's
 * current real data volumes (STATE.md's Phase 19 audit found single
 * businesses with double-digit-to-low-hundreds row counts); revisit with
 * real DB-side aggregation once a business's volume actually justifies
 * it -- the same "when data volume justifies it, not reflexively"
 * standard already applied to the deferred `knowledge_chunks` HNSW index.
 */
export async function listCustomersForBusiness(businessId: string): Promise<CustomerSummary[]> {
  const supabase = createServerSupabaseClient();

  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .order("last_activity_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (customersError) {
    throw new AppError(
      "Something went wrong loading your customers. Please try again.",
      "listCustomersForBusiness failed",
      customersError,
    );
  }

  const customerIds = customers.map((row) => row.id);
  if (customerIds.length === 0) return [];

  const [leadsResult, conversationsResult, appointmentsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id, customer_id, created_at, score, qualification, status, interest_type")
      .eq("business_id", businessId)
      .in("customer_id", customerIds),
    supabase
      .from("conversations")
      .select("id, customer_id, created_at, source, needs_attention, control")
      .eq("business_id", businessId)
      .in("customer_id", customerIds),
    supabase
      .from("appointments")
      .select("id, customer_id, created_at, status, starts_at")
      .eq("business_id", businessId)
      .in("customer_id", customerIds),
  ]);

  if (leadsResult.error || conversationsResult.error || appointmentsResult.error) {
    throw new AppError(
      "Something went wrong loading your customers. Please try again.",
      "listCustomersForBusiness aggregate lookup failed",
      leadsResult.error ?? conversationsResult.error ?? appointmentsResult.error,
    );
  }

  const leads = leadsResult.data;
  const conversations = conversationsResult.data;
  const appointments = appointmentsResult.data;

  const latestLeadByCustomer = latestByCreatedAt(leads);
  const latestConversationByCustomer = latestByCreatedAt(conversations);
  const latestAppointmentByCustomer = latestByCreatedAt(appointments);

  const conversationCountByCustomer = new Map<string, number>();
  for (const row of conversations) {
    if (!row.customer_id) continue;
    conversationCountByCustomer.set(row.customer_id, (conversationCountByCustomer.get(row.customer_id) ?? 0) + 1);
  }
  const appointmentCountByCustomer = new Map<string, number>();
  for (const row of appointments) {
    if (!row.customer_id) continue;
    appointmentCountByCustomer.set(row.customer_id, (appointmentCountByCustomer.get(row.customer_id) ?? 0) + 1);
  }

  const leadIds = leads.map((row) => row.id);
  const conversationIds = conversations.map((row) => row.id);
  const tagNamesByCustomer = await loadTagNamesByCustomer(supabase, businessId, leads, conversations, leadIds, conversationIds);

  return customers.map((customer) => {
    const latestLead = latestLeadByCustomer.get(customer.id);
    const latestConversation = latestConversationByCustomer.get(customer.id);
    const latestAppointment = latestAppointmentByCustomer.get(customer.id);

    return {
      id: customer.id,
      displayName: customer.display_name,
      email: customer.email,
      phone: customer.phone,
      firstSeenAt: customer.first_seen_at,
      lastActivityAt: customer.last_activity_at,
      latestLead: latestLead
        ? {
            id: latestLead.id,
            score: latestLead.score,
            qualification: latestLead.qualification,
            status: latestLead.status,
            interestType: latestLead.interest_type,
          }
        : null,
      latestChannel: latestConversation?.source ?? null,
      needsAttention: latestConversation?.needs_attention ?? false,
      humanControlled: latestConversation?.control === "human",
      conversationCount: conversationCountByCustomer.get(customer.id) ?? 0,
      appointmentCount: appointmentCountByCustomer.get(customer.id) ?? 0,
      latestAppointmentStatus: latestAppointment?.status ?? null,
      latestAppointmentStartsAt: latestAppointment?.starts_at ?? null,
      tagNames: tagNamesByCustomer.get(customer.id) ?? [],
    };
  });
}

async function loadTagNamesByCustomer(
  supabase: SupabaseClient,
  businessId: string,
  leads: { id: string; customer_id: string | null }[],
  conversations: { id: string; customer_id: string | null }[],
  leadIds: string[],
  conversationIds: string[],
): Promise<Map<string, string[]>> {
  const customerByLeadId = new Map(leads.filter((row) => row.customer_id).map((row) => [row.id, row.customer_id!]));
  const customerByConversationId = new Map(
    conversations.filter((row) => row.customer_id).map((row) => [row.id, row.customer_id!]),
  );

  const result = new Map<string, Set<string>>();
  const addName = (customerId: string | undefined, name: string | undefined) => {
    if (!customerId || !name) return;
    const set = result.get(customerId) ?? new Set<string>();
    set.add(name);
    result.set(customerId, set);
  };

  if (leadIds.length > 0) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("lead_id, lead_tags(name)")
      .eq("business_id", businessId)
      .in("lead_id", leadIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as { name: string } | null;
      addName(customerByLeadId.get(row.lead_id), tag?.name);
    }
  }

  if (conversationIds.length > 0) {
    const { data } = await supabase
      .from("conversation_tag_assignments")
      .select("conversation_id, lead_tags(name)")
      .eq("business_id", businessId)
      .in("conversation_id", conversationIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as { name: string } | null;
      addName(customerByConversationId.get(row.conversation_id), tag?.name);
    }
  }

  return new Map(Array.from(result.entries()).map(([customerId, names]) => [customerId, Array.from(names)]));
}

/**
 * A single customer's attribute snapshot, client-injected (Phase 29's
 * workflow engine runs under either the service-role or the
 * Clerk-authenticated client, depending on what triggered it -- see
 * lib/workflow-engine.ts). Deliberately a separate, lighter query shape
 * from `listCustomersForBusiness`'s batched version above rather than a
 * shared helper: that function is fixed to `createServerSupabaseClient()`
 * for the dashboard's own read path, and forcing a client parameter
 * through it for this one extra caller wasn't worth the churn to every
 * other call site. Same field shape (`CustomerSummary`) either way, so
 * `lib/segments.ts`'s `customerMatchesSegment()` evaluates both
 * identically -- segments and workflow conditions share one evaluator.
 */
export async function getCustomerSnapshotForWorkflow(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
): Promise<CustomerSummary | null> {
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return null;

  const [leadsResult, conversationsResult, appointmentsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id, created_at, score, qualification, status, interest_type")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, created_at, source, needs_attention, control")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, created_at, status, starts_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);

  const leads = leadsResult.data ?? [];
  const conversations = conversationsResult.data ?? [];
  const appointments = appointmentsResult.data ?? [];
  const latestLead = leads[0];
  const latestConversation = conversations[0];
  const latestAppointment = appointments[0];

  const leadIds = leads.map((row) => row.id);
  const conversationIds = conversations.map((row) => row.id);
  const tagNames = new Set<string>();

  if (leadIds.length > 0) {
    const { data } = await supabase.from("lead_tag_assignments").select("lead_tags(name)").eq("business_id", businessId).in("lead_id", leadIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as { name: string } | null;
      if (tag) tagNames.add(tag.name);
    }
  }
  if (conversationIds.length > 0) {
    const { data } = await supabase
      .from("conversation_tag_assignments")
      .select("lead_tags(name)")
      .eq("business_id", businessId)
      .in("conversation_id", conversationIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as { name: string } | null;
      if (tag) tagNames.add(tag.name);
    }
  }

  return {
    id: customer.id,
    displayName: customer.display_name,
    email: customer.email,
    phone: customer.phone,
    firstSeenAt: customer.first_seen_at,
    lastActivityAt: customer.last_activity_at,
    latestLead: latestLead
      ? { id: latestLead.id, score: latestLead.score, qualification: latestLead.qualification, status: latestLead.status, interestType: latestLead.interest_type }
      : null,
    latestChannel: latestConversation?.source ?? null,
    needsAttention: latestConversation?.needs_attention ?? false,
    humanControlled: latestConversation?.control === "human",
    conversationCount: conversations.length,
    appointmentCount: appointments.length,
    latestAppointmentStatus: latestAppointment?.status ?? null,
    latestAppointmentStartsAt: latestAppointment?.starts_at ?? null,
    tagNames: Array.from(tagNames),
  };
}

export type CustomerProfile = {
  customer: Customer;
  leads: Lead[];
  conversations: Conversation[];
  appointments: Appointment[];
  tags: LeadTag[];
  scoreHistory: LeadScoreHistoryEntry[];
};

/**
 * Full detail for one customer's profile page -- every conversation,
 * lead, appointment, and tag it's linked to, plus its most recent lead's
 * score history. `businessId` must come from `requireBusinessContext()`.
 * Returns `null` if `id` doesn't belong to `businessId` (no cross-tenant
 * existence leak, same convention as `getConversationForBusiness`).
 */
export async function getCustomerProfile(businessId: string, id: string): Promise<CustomerProfile | null> {
  const supabase = createServerSupabaseClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (customerError) {
    throw new AppError("Something went wrong loading this customer. Please try again.", "getCustomerProfile failed", customerError);
  }
  if (!customer) return null;

  const [leadsResult, conversationsResult, appointmentsResult] = await Promise.all([
    supabase.from("leads").select("*").eq("business_id", businessId).eq("customer_id", id).order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("*")
      .eq("business_id", businessId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("*")
      .eq("business_id", businessId)
      .eq("customer_id", id)
      .order("starts_at", { ascending: false }),
  ]);

  if (leadsResult.error || conversationsResult.error || appointmentsResult.error) {
    throw new AppError(
      "Something went wrong loading this customer. Please try again.",
      "getCustomerProfile aggregate lookup failed",
      leadsResult.error ?? conversationsResult.error ?? appointmentsResult.error,
    );
  }

  const leads = leadsResult.data;
  const conversations = conversationsResult.data;
  const appointments = appointmentsResult.data;

  const leadIds = leads.map((row) => row.id);
  const conversationIds = conversations.map((row) => row.id);

  const tagsById = new Map<string, LeadTag>();
  if (leadIds.length > 0) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("lead_tags(*)")
      .eq("business_id", businessId)
      .in("lead_id", leadIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as LeadTag | null;
      if (tag) tagsById.set(tag.id, tag);
    }
  }
  if (conversationIds.length > 0) {
    const { data } = await supabase
      .from("conversation_tag_assignments")
      .select("lead_tags(*)")
      .eq("business_id", businessId)
      .in("conversation_id", conversationIds);
    for (const row of data ?? []) {
      const tag = row.lead_tags as unknown as LeadTag | null;
      if (tag) tagsById.set(tag.id, tag);
    }
  }

  const latestLeadId = leads[0]?.id;
  const scoreHistory = latestLeadId ? await listLeadScoreHistory(businessId, latestLeadId) : [];

  return {
    customer,
    leads,
    conversations,
    appointments,
    tags: Array.from(tagsById.values()),
    scoreHistory,
  };
}

/**
 * Applies a catalog tag to a customer by assigning it to that customer's
 * most recent lead, falling back to its most recent conversation if it
 * has no lead yet -- reuses the existing lead/conversation tag surfaces
 * (Phase 27) rather than inventing a third tag-assignment table, per the
 * task's "don't build a third tag surface" instruction. Throws
 * `AppError("no_target")`-shaped guidance via a boolean return when a
 * customer has neither, since there is nothing to tag.
 */
export async function addTagToCustomer(businessId: string, customerId: string, tagId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) {
    await assignTagToLead(businessId, lead.id, tagId);
    return true;
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversation) {
    await assignTagToConversation(businessId, conversation.id, tagId);
    return true;
  }

  return false;
}

/**
 * Removes a catalog tag from a customer -- the mirror of `addTagToCustomer`.
 * Since a customer's tags are really stored per-lead/per-conversation
 * (Phase 27's existing surfaces, deliberately not duplicated -- see this
 * file's module doc comment), this clears the tag from every one of the
 * customer's own leads and conversations that carries it, so the tag
 * genuinely disappears from the customer's aggregated profile rather than
 * reappearing from a second, unremoved association.
 */
export async function removeTagFromCustomer(businessId: string, customerId: string, tagId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const [{ data: leads }, { data: conversations }] = await Promise.all([
    supabase.from("leads").select("id").eq("business_id", businessId).eq("customer_id", customerId),
    supabase.from("conversations").select("id").eq("business_id", businessId).eq("customer_id", customerId),
  ]);

  await Promise.all([
    ...(leads ?? []).map((lead) => removeTagFromLead(businessId, lead.id, tagId)),
    ...(conversations ?? []).map((conversation) => removeTagFromConversation(businessId, conversation.id, tagId)),
  ]);
}
