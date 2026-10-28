"use client";

import { useState } from "react";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { PLANS } from "@/lib/plans";
import { formatPaiseAsInr2dp } from "@/lib/invoice-format";
import type { TenantDetail } from "@/lib/admin-tenants";
import type { AdminAuditLogEntry } from "@/lib/supabase/types";
import { TenantNotes } from "./tenant-notes";

const TABS = ["Profile", "Usage", "Integrations", "Billing", "Activity", "Notes"] as const;
type Tab = (typeof TABS)[number];

export function TenantDetailTabs({ detail, auditLog }: { detail: TenantDetail; auditLog: AdminAuditLogEntry[] }) {
  const [tab, setTab] = useState<Tab>("Profile");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-ds-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "border-ds-accent text-ds-text-primary" : "border-transparent text-ds-text-secondary hover:text-ds-text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" ? <ProfileTab detail={detail} /> : null}
      {tab === "Usage" ? <UsageTab detail={detail} /> : null}
      {tab === "Integrations" ? <IntegrationsTab detail={detail} /> : null}
      {tab === "Billing" ? <BillingTab detail={detail} /> : null}
      {tab === "Activity" ? <ActivityTab auditLog={auditLog} /> : null}
      {tab === "Notes" ? <TenantNotes businessId={detail.business.id} notes={detail.notes} /> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{label}</span>
      <span className="text-sm text-ds-text-primary">{value}</span>
    </div>
  );
}

function ProfileTab({ detail }: { detail: TenantDetail }) {
  const b = detail.business;
  return (
    <div className="grid grid-cols-1 gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Business type" value={b.business_type} />
      <Field label="Contact email" value={b.contact_email ?? "—"} />
      <Field label="Contact phone" value={b.contact_phone ?? "—"} />
      <Field label="Website" value={b.website ?? "—"} />
      <Field label="Timezone" value={b.timezone} />
      <Field label="Signed up" value={new Date(b.created_at).toLocaleString()} />
      <Field label="Published" value={b.published_at ? new Date(b.published_at).toLocaleString() : "Not published"} />
      <div className="flex flex-col gap-0.5">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">Status</span>
        <Badge tone={b.status === "active" ? "success" : "danger"}>{b.status}</Badge>
      </div>
      {b.status === "suspended" ? <Field label="Suspended reason" value={b.suspended_reason ?? "—"} /> : null}
      {b.deleted_at ? <Field label="Soft-deleted" value={`${new Date(b.deleted_at).toLocaleString()} — ${b.deletion_reason ?? ""}`} /> : null}
    </div>
  );
}

function UsageTab({ detail }: { detail: TenantDetail }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">Conversations (all time)</span>
        <p className="text-2xl font-semibold text-ds-text-primary">{detail.usage.conversationsTotal}</p>
      </div>
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">Leads (all time)</span>
        <p className="text-2xl font-semibold text-ds-text-primary">{detail.usage.leadsTotal}</p>
      </div>
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">Appointments (all time)</span>
        <p className="text-2xl font-semibold text-ds-text-primary">{detail.usage.appointmentsTotal}</p>
      </div>
      <p className="col-span-full text-xs text-ds-text-muted">
        Gemini token/cost history over time ships in Stop 3, once per-tenant rollups exist (currently only a
        platform-wide today/MTD total is available on the Overview page).
      </p>
    </div>
  );
}

function IntegrationStatus({ label, data }: { label: string; data: TenantDetail["integrations"]["whatsapp"] }) {
  if (!data) {
    return (
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <span className="text-sm font-medium text-ds-text-primary">{label}</span>
        <p className="text-xs text-ds-text-muted">Not connected.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ds-text-primary">{label}</span>
        <Badge tone={data.status === "connected" ? "success" : data.status === "error" ? "danger" : "muted"}>{data.status}</Badge>
      </div>
      <span className="text-xs text-ds-text-muted">
        Last verified: {data.lastVerifiedAt ? new Date(data.lastVerifiedAt).toLocaleString() : "never"}
      </span>
      {data.lastError ? <span className="text-xs text-ds-danger">{data.lastError}</span> : null}
    </div>
  );
}

function IntegrationsTab({ detail }: { detail: TenantDetail }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <IntegrationStatus label="WhatsApp" data={detail.integrations.whatsapp} />
      <IntegrationStatus label="Instagram" data={detail.integrations.instagram} />
    </div>
  );
}

function BillingTab({ detail }: { detail: TenantDetail }) {
  const sub = detail.subscription;
  if (!sub) {
    return (
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 text-sm text-ds-text-secondary">
        No subscription row -- this tenant predates billing (grandfathered on Scale-equivalent entitlements,
        lib/subscription.ts&apos;s GRANDFATHERED_PLAN_KEY).
      </div>
    );
  }
  const plan = PLANS[sub.planKey];
  return (
    <div className="grid grid-cols-1 gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Plan" value={plan.name} />
      <Field label="Status" value={sub.status} />
      <Field label="Monthly price" value={formatPaiseAsInr2dp(plan.monthlyPricePaise)} />
      <Field label="Reply quota" value={sub.replyQuotaOverride ? `${sub.replyQuotaOverride} (admin override)` : String(plan.monthlyReplyQuota)} />
      <Field label="Current period" value={sub.currentPeriodStart ? `${new Date(sub.currentPeriodStart).toLocaleDateString()} – ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "?"}` : "—"} />
      <Field label="Trial ends" value={sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "—"} />
      <p className="col-span-full text-xs text-ds-text-muted">
        Invoices and credit notes are on the full Subscriptions &amp; Billing section (/apache/billing).
      </p>
    </div>
  );
}

function ActivityTab({ auditLog }: { auditLog: AdminAuditLogEntry[] }) {
  if (auditLog.length === 0) {
    return <p className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 text-sm text-ds-text-muted">No admin actions recorded for this tenant yet.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-ds-border rounded-ds-lg border border-ds-border bg-ds-surface">
      {auditLog.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-0.5 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ds-text-primary">{entry.action}</span>
            <span className="text-xs text-ds-text-muted">{new Date(entry.created_at).toLocaleString()}</span>
          </div>
          <span className="text-xs text-ds-text-muted">by {entry.actor_user_id}</span>
        </div>
      ))}
    </div>
  );
}
