import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness } from "@/lib/conversations";
import { listMessagesForConversation } from "@/lib/messages";
import { getLeadForConversation } from "@/lib/leads";
import { LiveConversationPanel } from "../_components/live-conversation-panel";
import type { LeadQualification } from "@/lib/supabase/types";

const QUALIFICATION_STYLE: Record<LeadQualification, string> = {
  hot: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warm: "bg-ds-success-bg text-ds-success",
  cold: "bg-ds-surface-soft text-ds-text-muted",
};

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, orgRole } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversation = await getConversationForBusiness(supabase, businessId, id);
  if (!conversation) {
    notFound();
  }

  const [messages, lead] = await Promise.all([
    listMessagesForConversation(supabase, businessId, conversation.id),
    getLeadForConversation(businessId, conversation.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Conversation</h1>
        <p className="text-sm text-ds-text-secondary">
          {new Date(conversation.created_at).toLocaleString()} · {conversation.source ?? "Chat widget"}
        </p>
      </div>

      <LiveConversationPanel
        conversationId={conversation.id}
        initialControl={conversation.control}
        initialNeedsAttention={conversation.needs_attention}
        initialMessages={messages}
        initialAsOf={messages.length > 0 ? messages[messages.length - 1].created_at : conversation.created_at}
        canEdit={hasMinRole(orgRole, "org:sales_agent")}
      />

      {lead ? (
        <div className="flex max-w-2xl flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-ds-text-primary">Lead</h2>
            <span
              title="AI-assessed signal -- not verified"
              className={`rounded-ds-sm px-2.5 py-1 text-2xs font-semibold tracking-wide-ds uppercase ${QUALIFICATION_STYLE[lead.qualification]}`}
            >
              {lead.qualification}
            </span>
          </div>
          <p className="font-medium text-ds-text-primary">{lead.contact_name ?? "Unnamed prospect"}</p>
          <p className="text-sm text-ds-text-secondary">
            {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
          </p>
          <p className="text-sm text-ds-text-secondary">
            Interest: {lead.interest_type ?? "—"}
            {lead.interest_id ? ` (matched: ${lead.interest_id})` : ""}
          </p>
          <p className="text-sm text-ds-text-muted">AI-written reason: {lead.qualification_reason}</p>
          {lead.notes ? <p className="text-sm text-ds-text-secondary">Notes: {lead.notes}</p> : null}
          <p className="text-xs text-ds-text-muted">Status: {lead.status}</p>
        </div>
      ) : null}
    </div>
  );
}
