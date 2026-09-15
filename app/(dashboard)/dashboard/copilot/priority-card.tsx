"use client";

import { useActionState } from "react";
import Link from "next/link";
import { generateSalesBriefAction, type GenerateBriefState } from "./actions";
import { SnoozeMenu } from "./snooze-menu";
import { MarkAsHandledButton } from "./mark-handled-button";
import { SalesBrief } from "./sales-brief";
import { Badge } from "../_components/badge";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { TodayActionItem } from "@/lib/copilot-actions";

const initialState: GenerateBriefState = {};

/**
 * One "today" item -- backed by a `copilot_actions` row (Phase 30 v2),
 * reconciled from the same deterministic signals v1 always used. Shows
 * the stable action title, why it's prioritized (live reason badges),
 * and the one recommended next step -- never a list of options.
 *
 * Button hierarchy (UI polish pass): "Open conversation" is the card's
 * one loud, filled primary action; "Mark as handled" is a strong
 * secondary (a real button, just not the loudest); "Snooze" and
 * "Generate/Regenerate brief" are ghost-tier utilities -- present, but
 * not competing for attention. The brief panel (when generated) renders
 * between the deterministic recommendation and the action row, so the
 * buttons stay the card's visual conclusion either way.
 *
 * "Mark as handled" (`canManage`, `org:sales_agent` minimum) keeps using
 * the original v1 `copilot_dismissals` mechanism unchanged (reason-key
 * suppression, 7-day expiry, "Recently handled" Undo) -- see
 * lib/copilot.ts. "Snooze" is new and distinct: "remind me at this time,"
 * not "I dealt with this."
 */
export function PriorityCard({ item, canManage }: { item: TodayActionItem; canManage: boolean }) {
  const [state, formAction, isPending] = useActionState(generateSalesBriefAction, initialState);
  const { customer, reasons, recommendedAction, title } = item;

  return (
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <Link href={`/dashboard/customers/${customer.id}`} className="text-base font-semibold text-ds-text-primary hover:underline">
            {customer.displayName ?? "Unnamed prospect"}
          </Link>
          <span className="text-xs text-ds-text-muted">
            {channelLabel(customer.latestChannel)}
            {customer.latestLead ? ` · Lead score ${customer.latestLead.score}/${MAX_LEAD_SCORE}` : ""}
          </span>
        </div>
        {customer.latestLead ? (
          <Badge tone={customer.latestLead.qualification === "hot" ? "accent" : customer.latestLead.qualification === "warm" ? "success" : "muted"} size="sm">
            {customer.latestLead.qualification}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-ds-text-primary">{title}</p>

        <div className="flex flex-wrap gap-1">
          {reasons.map((reason) => (
            <Badge key={reason.key} tone="muted" size="sm">
              {reason.label}
            </Badge>
          ))}
        </div>

        <p className="text-sm text-ds-text-secondary">
          <span className="font-medium text-ds-text-primary">Recommended: </span>
          {recommendedAction}
        </p>
      </div>

      {state.narrative && state.header ? <SalesBrief header={state.header} narrative={state.narrative} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="w-fit rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
          className="w-fit text-2xs font-medium text-ds-text-muted underline decoration-dotted transition-colors hover:text-ds-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
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
