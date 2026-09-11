import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness } from "@/lib/conversations";
import { listMessagesForConversation } from "@/lib/messages";
import { getLeadForConversation } from "@/lib/leads";
import { getAppointmentForConversation } from "@/lib/appointments";
import { getBusinessForOrg } from "@/lib/business";
import { getProduct } from "@/lib/products";
import { getService } from "@/lib/services";
import { channelLabel } from "@/lib/conversation-channel";
import { LiveConversationPanel } from "../_components/live-conversation-panel";
import { InfoPanel } from "../_components/info-panel";
import { ConversationPanes } from "../_components/conversation-panes";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversation = await getConversationForBusiness(supabase, businessId, id);
  if (!conversation) {
    notFound();
  }

  const [messages, lead, appointment, business] = await Promise.all([
    listMessagesForConversation(supabase, businessId, conversation.id),
    getLeadForConversation(businessId, conversation.id),
    getAppointmentForConversation(supabase, businessId, conversation.id),
    getBusinessForOrg(orgId),
  ]);

  // Resolved to a real name rather than shown as a raw id -- a lead's
  // matched product/service can be edited or deleted after the lead was
  // created, so this honestly says "no longer available" rather than
  // guessing.
  let interestName: string | null = null;
  if (lead?.interest_id) {
    if (lead.interest_type === "product") {
      interestName = (await getProduct(businessId, lead.interest_id))?.name ?? null;
    } else if (lead.interest_type === "service") {
      interestName = (await getService(businessId, lead.interest_id))?.name ?? null;
    }
  }

  return (
    <ConversationPanes
      transcript={
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-ds-bg">
          <div className="flex shrink-0 flex-col gap-1 p-4 pb-0 md:p-6 md:pb-0">
            <h1 className="text-2xl font-semibold text-ds-text-primary">
              {lead?.contact_name ?? channelLabel(conversation.source)}
            </h1>
            <p className="text-sm text-ds-text-secondary">
              {new Date(conversation.created_at).toLocaleString("en-US")} · {channelLabel(conversation.source)}
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
        </div>
      }
      infoPanel={
        <InfoPanel
          conversation={conversation}
          lead={lead}
          interestName={interestName}
          appointment={appointment}
          messageCount={messages.length}
          timezone={business?.timezone ?? "UTC"}
        />
      }
    />
  );
}
