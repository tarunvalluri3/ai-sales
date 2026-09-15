"use client";

import { useActionState } from "react";
import Link from "next/link";
import { generateSalesBriefAction, type GenerateBriefState } from "./actions";
import { SnoozeMenu } from "./snooze-menu";
import { MarkAsHandledButton } from "./mark-handled-button";
import { Badge } from "../_components/badge";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { TodayActionItem } from "@/lib/copilot-actions";

const initialState: GenerateBriefState = {};

/**
 * One "today" item -- backed by a `copilot_actions` row (Phase 30 v2),
 * reconciled from the same deterministic signals v1 always used. Shows
 * the stable action title, why it's prioritized (live reason badges),
 * and the one recommended next step -- never a list of options. Never
 * sends anything itself -- every action here is something the staff
 * member does elsewhere (the conversation/appointment pages) or a
 * lifecycle transition on the recommendation itself.
 *
 * "Mark as handled" (`canManage`, `org:sales_agent` minimum) keeps using
 * the original v1 `copilot_dismissals` mechanism unchanged (reason-key
 * suppression, 7-day expiry, "Recently handled" Undo) -- see
 * lib/copilot.ts. "Snooze" is new and distinct: "remind me at this time,"
 * not "I dealt with this." "Generate brief" stays available but
 * secondary, per the task's own instruction.
 */
export function PriorityCard({ item, canManage }: { item: TodayActionItem; canManage: boolean }) {
  const [state, formAction, isPending] = useActionState(generateSalesBriefAction, initialState);
  const { customer, reasons, recommendedAction, title } = item;

  return (
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <Link href={`/dashboard/customers/${customer.id}`} className="text-sm font-semibold text-ds-text-primary hover:underline">
            {customer.displayName ?? "Unnamed prospect"}
          </Link>
          <span className="text-xs text-ds-text-muted">
            {channelLabel(customer.latestChannel)}
            {customer.latestLead ? ` · Score ${customer.latestLead.score}/${MAX_LEAD_SCORE}` : ""}
          </span>
        </div>
        {customer.latestLead ? (
          <Badge tone={customer.latestLead.qualification === "hot" ? "accent" : customer.latestLead.qualification === "warm" ? "success" : "muted"} size="sm">
            {customer.latestLead.qualification}
          </Badge>
        ) : null}
      </div>

      <p className="text-sm font-semibold text-ds-text-primary">{title}</p>

      <div className="flex flex-wrap gap-1">
        {reasons.map((reason) => (
          <Badge key={reason.key} tone="muted" size="sm">
            {reason.label}
          </Badge>
        ))}
      </div>

      <p className="text-sm text-ds-text-primary">
        <span className="font-medium">Recommended: </span>
        {recommendedAction}
      </p>

      {state.narrative ? (
        <div className="flex flex-col gap-1 rounded-ds-sm bg-ds-surface-soft p-3">
          <pre className="whitespace-pre-wrap font-sans text-xs text-ds-text-secondary">{state.header}</pre>
          <div className="border-t border-ds-border pt-2">
            <pre className="whitespace-pre-wrap font-sans text-xs text-ds-text-secondary">{state.narrative}</pre>
            <p className="mt-1 text-2xs text-ds-text-muted">AI-generated — may be inaccurate, not verified.</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong"
        >
          Open conversation
        </Link>

        <MarkAsHandledButton customerId={customer.id} reasonKeys={reasons.map((reason) => reason.key)} canManage={canManage} />

        <SnoozeMenu customerId={customer.id} actionType={item.actionType} canSnooze={canManage} />
      </div>

      <form action={formAction} className="flex items-center">
        <input type="hidden" name="customerId" value={customer.id} />
        <button
          type="submit"
          disabled={isPending}
          className="w-fit text-xs font-medium text-ds-text-muted underline decoration-dotted transition-colors hover:text-ds-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Generating…" : state.narrative ? "Regenerate brief" : "Generate brief"}
        </button>
        {state.error ? (
          <span role="alert" className="ml-2 text-xs text-ds-danger">
            {state.error}
          </span>
        ) : null}
      </form>
    </div>
  );
}
