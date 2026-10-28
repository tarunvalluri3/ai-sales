"use client";

import { useState } from "react";
import { ConfirmActionDialog } from "../../_components/confirm-action-dialog";
import {
  suspendTenant,
  reactivateTenant,
  extendTenantTrial,
  changeTenantPlan,
  adjustTenantUsageLimit,
  resetTenantIntegration,
  softDeleteTenant,
  hardDeleteTenant,
} from "@/lib/admin-tenant-actions";
import { PLAN_KEYS, PLANS, type PlanKey } from "@/lib/plans";
import type { TenantDetail } from "@/lib/admin-tenants";
import type { PlatformAdminRole } from "@/lib/supabase/types";

const BUTTON_CLASS =
  "rounded-ds-sm border border-ds-border px-3 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";
const DANGER_BUTTON_CLASS =
  "rounded-ds-sm border border-ds-danger/40 px-3 py-1.5 text-xs font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

export function TenantActionsBar({ tenant, adminRole }: { tenant: TenantDetail; adminRole: PlatformAdminRole }) {
  const isOwner = adminRole === "owner";
  const isViewer = adminRole === "viewer";
  const businessId = tenant.business.id;

  const [extendDays, setExtendDays] = useState(7);
  const [newPlan, setNewPlan] = useState<PlanKey>(tenant.subscription?.planKey ?? "starter");
  const [limitInput, setLimitInput] = useState(tenant.subscription?.replyQuotaOverride?.toString() ?? "");

  if (isViewer) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tenant.business.status === "active" ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Suspend
            </button>
          )}
          title="Suspend this tenant"
          description="Their dashboard and AI widget stop serving immediately. They can be reactivated at any time."
          onConfirm={(reason) => suspendTenant(businessId, reason)}
        />
      ) : (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Reactivate
            </button>
          )}
          title="Reactivate this tenant"
          description="Their dashboard and AI widget resume serving immediately."
          onConfirm={(reason) => reactivateTenant(businessId, reason)}
        />
      )}

      {tenant.subscription?.status === "trialing" ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Extend trial
            </button>
          )}
          title="Extend this tenant's trial"
          description="Adds days to the current trial end date."
          onConfirm={(reason) => extendTenantTrial(businessId, { days: extendDays, reason })}
          extraFields={
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ds-text-primary">Days to add</span>
              <input
                type="number"
                min={1}
                max={90}
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value))}
                className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              />
            </label>
          }
        />
      ) : null}

      {isOwner ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Change plan
            </button>
          )}
          title="Change this tenant's plan"
          description="Sets the stored plan directly -- no Razorpay charge or proration happens. Owner-only (billing mutation)."
          onConfirm={(reason) => changeTenantPlan(businessId, { planKey: newPlan, reason })}
          extraFields={
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ds-text-primary">New plan</span>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as PlanKey)}
                className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {PLAN_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PLANS[key].name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      ) : null}

      <ConfirmActionDialog
        trigger={(open) => (
          <button type="button" onClick={open} className={BUTTON_CLASS}>
            Adjust usage limit
          </button>
        )}
        title="Adjust this tenant's reply quota"
        description="Overrides the plan's reply quota for this tenant. Leave blank to clear the override and fall back to the plan default."
        onConfirm={(reason) =>
          adjustTenantUsageLimit(businessId, {
            replyQuotaOverride: limitInput.trim() === "" ? null : Number(limitInput),
            reason,
          })
        }
        extraFields={
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ds-text-primary">Reply quota override (blank to clear)</span>
            <input
              type="number"
              min={1}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            />
          </label>
        }
      />

      {tenant.integrations.whatsapp ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Reset WhatsApp
            </button>
          )}
          title="Reset this tenant's WhatsApp connection"
          description="Marks the connection disconnected so the tenant must re-verify it. Does not revoke anything on Meta's side."
          onConfirm={(reason) => resetTenantIntegration(businessId, "whatsapp", reason)}
        />
      ) : null}
      {tenant.integrations.instagram ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={BUTTON_CLASS}>
              Reset Instagram
            </button>
          )}
          title="Reset this tenant's Instagram connection"
          description="Marks the connection disconnected so the tenant must re-verify it. Does not revoke anything on Meta's side."
          onConfirm={(reason) => resetTenantIntegration(businessId, "instagram", reason)}
        />
      ) : null}

      {isOwner && !tenant.business.deleted_at ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={DANGER_BUTTON_CLASS}>
              Soft delete
            </button>
          )}
          title="Soft-delete this tenant"
          description="Blocks their dashboard and AI widget immediately. Owner-only. A scheduled anonymization sweep after the grace period is not yet built (STATE.md) -- this marks the tenant deleted but does not yet scrub its data automatically."
          dangerous
          onConfirm={(reason) => softDeleteTenant(businessId, reason)}
        />
      ) : null}

      {isOwner ? (
        <ConfirmActionDialog
          trigger={(open) => (
            <button type="button" onClick={open} className={DANGER_BUTTON_CLASS}>
              Hard delete
            </button>
          )}
          title="Permanently delete this tenant"
          description="This cannot be undone. Every conversation, lead, appointment, and knowledge document is permanently deleted. Invoices and credit notes are retained for GST compliance. Owner-only, double-confirmed."
          dangerous
          confirmText={tenant.business.name}
          onConfirm={(reason) => hardDeleteTenant(businessId, { confirmName: tenant.business.name, reason })}
        />
      ) : null}
    </div>
  );
}
