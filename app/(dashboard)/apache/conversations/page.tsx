import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listConversationsAcrossTenants, listLeadsAcrossTenants } from "@/lib/admin-conversations";
import { AdminPageHeader } from "../_components/page-header";
import { ConversationsLeadsTabs } from "./conversations-leads-tabs";

export default async function ApacheConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string; status?: string }>;
}) {
  await requirePlatformAdmin("viewer");
  const params = await searchParams;

  const [conversations, leads] = await Promise.all([
    listConversationsAcrossTenants({
      search: params.q,
      channel: params.channel === "chat_widget" || params.channel === "whatsapp" || params.channel === "instagram" ? params.channel : undefined,
      status: params.status === "ai" || params.status === "human" || params.status === "needs_attention" ? params.status : undefined,
    }),
    listLeadsAcrossTenants(params.q),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader
        title="Conversations & Leads"
        description="Read-only, cross-tenant. Contact info is masked by default; revealing it is logged. Opening a transcript is logged."
      />
      <ConversationsLeadsTabs conversations={conversations} leads={leads} initialQuery={params.q ?? ""} />
    </div>
  );
}
