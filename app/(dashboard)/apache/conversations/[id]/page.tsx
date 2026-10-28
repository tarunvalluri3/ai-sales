import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getConversationTranscript } from "@/lib/admin-conversations";
import { recordTranscriptView } from "@/lib/admin-conversation-actions";
import { AdminBreadcrumbs } from "../../_components/breadcrumbs";
import { AdminPageHeader } from "../../_components/page-header";

export default async function ConversationTranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin("viewer");
  const { id } = await params;

  const transcript = await getConversationTranscript(id);
  if (!transcript) notFound();

  // Approved security brief: "every view of customer conversation content
  // writes to [the audit log]". Logged here, once per page load -- not on
  // the list page, which shows only masked summaries.
  await recordTranscriptView(id, transcript.businessId);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminBreadcrumbs trail={[{ label: "Conversations & Leads", href: "/apache/conversations" }, { label: transcript.businessName }]} />
      <AdminPageHeader title={`Conversation — ${transcript.businessName}`} description="This view was just recorded in the audit log." />

      <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        {transcript.messages.length === 0 ? (
          <p className="text-sm text-ds-text-muted">No messages in this conversation.</p>
        ) : (
          transcript.messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-1 rounded-ds-sm p-3 text-sm ${
                message.role === "user" ? "bg-ds-surface-soft" : "bg-ds-surface-elevated"
              }`}
            >
              <div className="flex items-center justify-between text-2xs text-ds-text-muted">
                <span className="font-semibold uppercase tracking-wide-ds">{message.role.replace("_", " ")}</span>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-ds-text-primary">{message.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
