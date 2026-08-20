import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listAuditLogForBusiness } from "@/lib/audit-log";
import type { AuditLogAction } from "@/lib/supabase/types";

const ACTION_LABEL: Record<AuditLogAction, string> = {
  "conversation.control_changed": "Conversation control changed",
  "conversation.attention_dismissed": "Attention dismissed",
  "knowledge.deleted": "Knowledge document deleted",
  "knowledge.published": "Knowledge document published",
  "knowledge.unpublished": "Knowledge document unpublished",
  "widget_key.created": "Widget key created",
  "widget_key.origins_updated": "Widget key origins updated",
  "widget_key.revoked": "Widget key revoked",
  "webhook_endpoint.created": "Webhook endpoint created",
  "webhook_endpoint.deleted": "Webhook endpoint deleted",
  "business_hours.updated": "Business hours updated",
  "widget_branding.updated": "Widget branding updated",
};

export default async function AuditLogPage() {
  const { businessId } = await requireBusinessContext();
  const entries = await listAuditLogForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Audit Log</h1>
        <p className="text-sm text-ds-text-secondary">
          A record of sensitive actions taken by your team -- conversation takeovers, knowledge
          and widget key changes, and more. Most recent {entries.length} shown.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-ds-lg border border-dashed border-ds-border px-4 py-14 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No audit entries yet</p>
          <p className="max-w-sm text-xs text-ds-text-muted">
            Sensitive actions your team takes -- taking over a conversation, dismissing an attention
            flag, deleting a knowledge document -- will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-ds-text-primary">{ACTION_LABEL[entry.action]}</p>
                <p className="text-xs text-ds-text-muted">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
              <p className="text-sm text-ds-text-secondary">
                By {entry.actor_user_id}
                {entry.metadata
                  ? " · " +
                    Object.entries(entry.metadata)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ")
                  : ""}
              </p>
              {entry.target_type === "conversation" ? (
                <Link
                  href={`/dashboard/conversations/${entry.target_id}`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  View conversation
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
