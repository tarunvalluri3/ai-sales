"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, Circle, MinusCircle } from "lucide-react";
import { Badge } from "../_components/badge";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import {
  setReadinessDismissalAction,
  type ReadinessDismissalActionState,
} from "./actions";
import type { ReadinessItem, ReadinessReport } from "@/lib/onboarding-readiness";

const initialDismissalState: ReadinessDismissalActionState = {};

function StatusIcon({ item }: { item: ReadinessItem }) {
  if (item.status === "met") {
    return <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ds-success" />;
  }
  if (item.status === "not_applicable") {
    return <MinusCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-ds-text-muted" />;
  }
  if (item.tier === "required") {
    return <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-ds-warning" />;
  }
  return <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-ds-text-muted" />;
}

function statusLabel(item: ReadinessItem): string {
  if (item.status === "met") return "Done";
  if (item.status === "not_applicable") return "Not applicable";
  return item.tier === "required" ? "Required" : "Recommended";
}

function DismissControl({ item, canEdit }: { item: ReadinessItem; canEdit: boolean }) {
  const [state, formAction, isPending] = useActionState(
    setReadinessDismissalAction,
    initialDismissalState,
  );
  const makeDismissed = item.status !== "not_applicable";

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="itemKey" value={item.key} />
      <input type="hidden" name="dismissed" value={makeDismissed ? "true" : "false"} />
      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {makeDismissed ? "Mark not applicable" : "This does apply to us"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function ChecklistItem({ item, canEdit }: { item: ReadinessItem; canEdit: boolean }) {
  return (
    <li className="flex flex-col gap-1 border-t border-ds-border py-3 first:border-t-0">
      <div className="flex items-start gap-2">
        <StatusIcon item={item} />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-ds-text-primary">{item.label}</span>
            <Badge
              tone={
                item.status === "met"
                  ? "success"
                  : item.status === "not_applicable"
                    ? "muted"
                    : item.tier === "required"
                      ? "warning"
                      : "muted"
              }
              size="sm"
            >
              {statusLabel(item)}
            </Badge>
          </div>
          <p className="text-xs text-ds-text-secondary">{item.why}</p>
          {item.status === "unmet" && item.action ? (
            <p className="text-xs text-ds-text-muted">{item.action}</p>
          ) : null}
          {item.dismissible && item.status !== "met" ? (
            <DismissControl item={item} canEdit={canEdit} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * The onboarding readiness checklist (feat/onboarding-readiness). Shown on
 * both /onboarding/test and /dashboard/widget-settings, above the publish
 * button. Marks what's required vs recommended, explains why each matters,
 * and -- for an unpublished business -- makes plain what still blocks going
 * live. For an already-published business it is an audit, never a block
 * (the server gate skips a republish), so no live agent is ever disabled.
 */
export function ReadinessChecklist({
  report,
  canEdit = true,
}: {
  report: ReadinessReport;
  canEdit?: boolean;
}) {
  const required = report.items.filter((item) => item.tier === "required");
  const recommended = report.items.filter((item) => item.tier === "recommended");
  const blockingCount = report.blockingItems.length;

  return (
    <div className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ds-text-primary">Readiness checklist</h2>
          <p className="max-w-xl text-sm text-ds-text-secondary">
            {!report.gateApplies
              ? "Your AI is already live. This list is a health check — nothing here will take it offline."
              : report.canPublish
                ? "Your AI has enough to answer prospects accurately. You're ready to publish."
                : `Give your AI enough to answer prospects accurately before it goes live. ${blockingCount} required ${blockingCount === 1 ? "item" : "items"} left.`}
          </p>
        </div>
        <Badge tone={report.canPublish ? "success" : "warning"}>
          {report.canPublish ? "Ready" : "Not ready"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide-ds text-ds-text-muted">
          Required to publish
        </h3>
        <ul className="flex flex-col">
          {required.map((item) => (
            <ChecklistItem key={item.key} item={item} canEdit={canEdit} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide-ds text-ds-text-muted">
          Recommended
        </h3>
        <ul className="flex flex-col">
          {recommended.map((item) => (
            <ChecklistItem key={item.key} item={item} canEdit={canEdit} />
          ))}
        </ul>
      </div>
    </div>
  );
}
