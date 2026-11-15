import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock,
  CloudUpload,
  Code2,
  CreditCard,
  Lock,
  MessageCircleMore,
  ScrollText,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { requireLiveBusinessContext } from "@/lib/business-context";
import { listAuditLogForBusiness } from "@/lib/audit-log";
import type { AuditLogAction } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";
import { Avatar, Card, PageHeader, linkAccent } from "../_components/ui";

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
  "business.published": "Business published",
  "widget_suggested_questions.updated": "Suggested questions updated",
  "ai_conversion_goal.updated": "AI conversion goal updated",
  "appointment_settings.updated": "Appointment settings updated",
  "appointment.confirmed": "Appointment confirmed",
  "appointment.declined": "Appointment declined",
  "appointment.cancelled": "Appointment cancelled",
  "ai_capabilities.updated": "AI capabilities updated",
  "whatsapp_connection.created": "WhatsApp connected",
  "whatsapp_connection.deleted": "WhatsApp disconnected",
  "appointment_exception.created": "Schedule override added",
  "appointment_exception.deleted": "Schedule override removed",
  "appointment.completed": "Appointment marked completed",
  "appointment.no_show": "Appointment marked no-show",
  "appointment_slot_block.created": "Slot blocked",
  "appointment_slot_block.deleted": "Slot unblocked",
  "instagram_connection.created": "Instagram connected",
  "instagram_connection.deleted": "Instagram disconnected",
  "customer.renamed": "Customer renamed",
  "segment.created": "Segment created",
  "segment.updated": "Segment updated",
  "segment.deleted": "Segment deleted",
  "workflow.created": "Workflow created",
  "workflow.updated": "Workflow updated",
  "workflow.deleted": "Workflow deleted",
  "workflow.enabled": "Workflow enabled",
  "workflow.disabled": "Workflow disabled",
  "workflow_run.cancelled": "Workflow run cancelled",
  "copilot.item_dismissed": "Copilot item marked handled",
  "copilot.item_undismissed": "Copilot item restored",
  "copilot.action_snoozed": "Copilot action snoozed",
  "copilot.action_completed": "Copilot action completed",
  "copilot.action_superseded": "Copilot action superseded",
  "notification_preferences.updated": "Notification settings updated",
  // Phase 17b. The entries written by the Razorpay webhook and the daily
  // billing sweep carry actor "system:razorpay" rather than a user id --
  // worth knowing when reading this list, since every other row here was
  // caused by a person.
  "subscription.checkout_started": "Checkout started",
  "subscription.activated": "Subscription activated",
  "subscription.charged": "Subscription payment taken",
  "subscription.payment_failed": "Subscription payment failed",
  "subscription.grace_lapsed": "Grace period lapsed -- AI replies paused",
  "subscription.cancellation_scheduled": "Cancellation scheduled for period end",
  "subscription.expired": "Subscription ended",
  "subscription.plan_changed": "Plan changed",
  "subscription.plan_change_scheduled": "Plan change scheduled for period end",
  // Phase 17c.
  "invoice.issued": "GST tax invoice issued",
  "credit_note.issued": "Credit note issued",
  "billing_details.updated": "Billing details updated",
};

type AreaKey =
  | "conversations"
  | "knowledge"
  | "widget"
  | "webhooks"
  | "hours"
  | "publishing"
  | "appointments"
  | "channels"
  | "customers"
  | "workflows"
  | "copilot"
  | "settings"
  | "billing";

const AREA_LABEL: Record<AreaKey, string> = {
  conversations: "Conversations",
  knowledge: "Knowledge",
  widget: "Widget",
  webhooks: "Webhooks",
  hours: "Business hours",
  publishing: "Publishing",
  appointments: "Appointments",
  channels: "Channels",
  customers: "Customers",
  workflows: "Workflows",
  copilot: "Sales Copilot",
  settings: "Settings",
  billing: "Billing",
};

/** Which part of the product an action belongs to, from its `area.verb` name. */
function areaOf(action: AuditLogAction): AreaKey {
  const prefix = action.split(".")[0];
  if (prefix === "conversation") return "conversations";
  if (prefix === "knowledge") return "knowledge";
  if (prefix.startsWith("widget") || prefix.startsWith("ai_")) return "widget";
  if (prefix === "webhook_endpoint") return "webhooks";
  if (prefix === "business_hours") return "hours";
  if (prefix === "business") return "publishing";
  if (prefix.startsWith("appointment")) return "appointments";
  if (prefix.endsWith("_connection")) return "channels";
  if (prefix === "customer" || prefix === "segment") return "customers";
  if (prefix.startsWith("workflow")) return "workflows";
  if (prefix === "copilot") return "copilot";
  if (prefix === "subscription" || prefix === "invoice" || prefix === "credit_note" || prefix === "billing_details") return "billing";
  return "settings";
}

function AreaIcon({ area }: { area: AreaKey }) {
  const className = "size-5";
  switch (area) {
    case "conversations":
      return <UserRound className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "knowledge":
      return <BookOpen className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "widget":
      return <Code2 className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "webhooks":
      return <Webhook className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "hours":
      return <Clock className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "publishing":
      return <CloudUpload className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "appointments":
      return <CalendarDays className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "channels":
      return <MessageCircleMore className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "customers":
      return <Users className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "workflows":
      return <Workflow className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "copilot":
      return <Sparkles className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "billing":
      return <CreditCard className={className} strokeWidth={1.75} aria-hidden="true" />;
    default:
      return <Settings className={className} strokeWidth={1.75} aria-hidden="true" />;
  }
}

/** "snake_case" / "camelCase" metadata keys as a short readable label. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default async function AuditLogPage() {
  const { businessId } = await requireLiveBusinessContext();
  const entries = await listAuditLogForBusiness(businessId);

  // Group consecutive entries (already newest first) under their calendar day.
  const groups: { day: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const day = new Date(entry.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  const now = new Date();
  const todayKey = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = yesterday.toDateString();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={ScrollText}
        title="Audit log"
        description="A record of sensitive actions taken by your team."
        actions={
          <span className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-text-primary">
            <Lock className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Read-only
          </span>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          title="No audit entries yet"
          description="Sensitive actions your team takes, such as taking over a conversation, dismissing an attention flag or deleting a knowledge document, will appear here."
        />
      ) : (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-ds-text-primary">
            <span className="font-medium">Most recent {entries.length} entries</span> · Newest first
          </p>

          {groups.map((group) => {
            const date = new Date(group.entries[0].created_at);
            const dateLabel = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
            const prefix = group.day === todayKey ? "Today · " : group.day === yesterdayKey ? "Yesterday · " : "";
            return (
              <section key={group.day} className="flex flex-col gap-1">
                <h2 className="rounded-xl bg-ds-surface-soft px-4 py-2 text-base font-medium text-ds-text-primary">
                  {prefix}
                  {dateLabel}
                </h2>
                <ol className="dx-rows flex flex-col px-2">
                  {group.entries.map((entry) => {
                    const area = areaOf(entry.action);
                    const metadata = entry.metadata ? Object.entries(entry.metadata) : [];
                    return (
                      <li key={entry.id} className="flex flex-wrap items-start gap-x-5 gap-y-2 py-3.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary">
                          <AreaIcon area={area} />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="text-sm leading-snug font-medium text-ds-text-primary">
                              {ACTION_LABEL[entry.action]}
                            </span>
                            <span className="dx-pill bg-ds-surface-soft px-3 py-0.5 text-sm text-ds-text-primary">{AREA_LABEL[area]}</span>
                          </p>
                          {metadata.length > 0 ? (
                            <p className="text-sm break-words text-ds-text-secondary">
                              {metadata.map(([key, value]) => `${humanizeKey(key)}: ${value}`).join(" · ")}
                            </p>
                          ) : null}
                          {entry.target_type === "conversation" ? (
                            <Link href={`/dashboard/conversations/${entry.target_id}`} className={`${linkAccent} w-fit text-base`}>
                              View conversation
                              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                            </Link>
                          ) : null}
                        </div>
                        <p className="flex min-w-0 items-center gap-3 sm:w-64" title={entry.actor_user_id}>
                          <Avatar name={entry.actor_user_id.startsWith("system:") ? "System" : entry.actor_user_id.replace(/^user_/, "")} size="sm" />
                          <span className="truncate text-sm text-ds-text-primary">
                            {entry.actor_user_id.startsWith("system:") ? `System (${entry.actor_user_id.slice(7)})` : entry.actor_user_id}
                          </span>
                        </p>
                        <time dateTime={entry.created_at} className="w-24 shrink-0 text-right text-sm tabular-nums text-ds-text-primary">
                          {new Date(entry.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}

          <p className="border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
            Showing the most recent {entries.length} entries.
          </p>
        </Card>
      )}
    </div>
  );
}
