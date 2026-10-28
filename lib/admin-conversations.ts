import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { maskEmail, maskPhone } from "@/lib/admin-pii-mask";
import type { MessageRole } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 4 (docs/phases.md): read-only, cross-tenant conversation
 * and lead search for /apache/conversations. Sandbox conversations
 * (`dashboard_test`) are excluded, same as every tenant-facing analytics
 * query. PII (lead email/phone) is masked by default
 * (lib/admin-pii-mask.ts); only `revealLeadContact` (below) returns the
 * real value, and it is rate-limited/audited by the caller.
 */

const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;
const LIST_LIMIT = 200;

export type ConversationSearchFilters = {
  search?: string;
  channel?: "chat_widget" | "whatsapp" | "instagram";
  status?: "ai" | "human" | "needs_attention";
};

export type ConversationListRow = {
  id: string;
  businessId: string;
  businessName: string;
  source: string | null;
  control: string;
  needsAttention: boolean;
  createdAt: string;
  maskedContact: string | null;
};

export async function listConversationsAcrossTenants(filters: ConversationSearchFilters = {}): Promise<ConversationListRow[]> {
  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("conversations")
    .select("id, business_id, source, control, needs_attention, created_at, businesses(name)")
    .or(EXCLUDE_SANDBOX_FILTER)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  // Channel is filtered in JS below, not chained as a second .or() here --
  // supabase-js's query builder only keeps the LAST .or() call's filter
  // param when called twice, which would silently drop the sandbox
  // exclusion above. The channel filter only needs LIST_LIMIT rows'
  // worth of JS filtering, which is cheap at this bound.
  if (filters.status === "needs_attention") query = query.eq("needs_attention", true);
  if (filters.status === "human") query = query.eq("control", "human");
  if (filters.status === "ai") query = query.eq("control", "ai");

  const { data, error } = await query;
  if (error || !data) {
    console.error(JSON.stringify({ event: "admin_conversations_list_failed", timestamp: new Date().toISOString() }));
    return [];
  }

  type Row = {
    id: string;
    business_id: string;
    source: string | null;
    control: string;
    needs_attention: boolean;
    created_at: string;
    businesses: { name: string } | null;
  };

  const conversationRows = data as unknown as Row[];

  // Fetched separately rather than embedded in the select above: an
  // embedded one-to-many (leads.conversation_id -> conversations.id)
  // returns an array from PostgREST, but leads.conversation_id is also
  // UNIQUE (PRODUCT.md), and whether that makes a given PostgREST version
  // collapse it to a single object instead is genuinely ambiguous without
  // testing against the live schema -- a plain IN query removes the
  // ambiguity entirely.
  const { data: leadRows } = await supabase
    .from("leads")
    .select("conversation_id, contact_email, contact_phone")
    .in("conversation_id", conversationRows.map((r) => r.id));
  const leadByConversationId = new Map((leadRows ?? []).map((l) => [l.conversation_id, l]));

  let rows = conversationRows.map((row) => {
    const lead = leadByConversationId.get(row.id);
    const maskedContact = lead?.contact_email ? maskEmail(lead.contact_email) : lead?.contact_phone ? maskPhone(lead.contact_phone) : null;
    return {
      id: row.id,
      businessId: row.business_id,
      businessName: row.businesses?.name ?? "Unknown",
      source: row.source,
      control: row.control,
      needsAttention: row.needs_attention,
      createdAt: row.created_at,
      maskedContact,
    };
  });

  if (filters.channel === "chat_widget") {
    // Website conversations are source IS NULL or source = 'chat_widget'
    // (lib/conversation-channel.ts's channelLabel() treats both as
    // "Website").
    rows = rows.filter((r) => r.source === null || r.source === "chat_widget");
  } else if (filters.channel) {
    rows = rows.filter((r) => r.source === filters.channel);
  }

  if (filters.search) {
    const term = filters.search.toLowerCase();
    rows = rows.filter((r) => r.businessName.toLowerCase().includes(term));
  }

  return rows;
}

export type ConversationTranscript = {
  id: string;
  businessId: string;
  businessName: string;
  messages: { id: string; role: MessageRole; content: string; createdAt: string }[];
};

/** Does NOT record the audit row itself -- the caller (the page) does that, since it has the acting admin's identity from requirePlatformAdmin(). */
export async function getConversationTranscript(conversationId: string): Promise<ConversationTranscript | null> {
  const supabase = createAdminSupabaseClient();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, business_id, businesses(name)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conversation) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return {
    id: conversation.id,
    businessId: conversation.business_id,
    businessName: (conversation.businesses as unknown as { name: string } | null)?.name ?? "Unknown",
    messages: (messages ?? []).map((m) => ({ id: m.id, role: m.role as MessageRole, content: m.content, createdAt: m.created_at })),
  };
}

export type LeadListRow = {
  id: string;
  businessId: string;
  businessName: string;
  conversationId: string;
  status: string;
  qualification: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  createdAt: string;
};

export async function listLeadsAcrossTenants(search?: string): Promise<LeadListRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, business_id, conversation_id, status, qualification, contact_email, contact_phone, created_at, businesses(name)")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error || !data) return [];

  let rows = (data as unknown as Array<{
    id: string;
    business_id: string;
    conversation_id: string;
    status: string;
    qualification: string;
    contact_email: string | null;
    contact_phone: string | null;
    created_at: string;
    businesses: { name: string } | null;
  }>).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    businessName: row.businesses?.name ?? "Unknown",
    conversationId: row.conversation_id,
    status: row.status,
    qualification: row.qualification,
    maskedEmail: row.contact_email ? maskEmail(row.contact_email) : null,
    maskedPhone: row.contact_phone ? maskPhone(row.contact_phone) : null,
    createdAt: row.created_at,
  }));

  if (search) {
    const term = search.toLowerCase();
    rows = rows.filter((r) => r.businessName.toLowerCase().includes(term));
  }

  return rows;
}

export type RevealedLeadContact = { email: string | null; phone: string | null };

/** Returns the REAL, unmasked contact info for one lead. The caller must gate this behind requirePlatformAdmin, the admin_pii_reveal rate limit, and an audit log entry -- this function itself does none of that, matching lib/admin-tenants.ts's existing read/action split. */
export async function revealLeadContact(leadId: string): Promise<RevealedLeadContact | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("leads").select("contact_email, contact_phone").eq("id", leadId).maybeSingle();
  if (error || !data) return null;
  return { email: data.contact_email, phone: data.contact_phone };
}
