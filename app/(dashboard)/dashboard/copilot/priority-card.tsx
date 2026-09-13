"use client";

import { useActionState } from "react";
import Link from "next/link";
import { generateSalesBriefAction, type GenerateBriefState } from "./actions";
import { Badge } from "../_components/badge";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { PriorityItem } from "@/lib/copilot";

const initialState: GenerateBriefState = {};

/**
 * One "today" item: the deterministic reasons it's here, one recommended
 * action, and an on-demand "Generate brief" expansion. Never sends
 * anything itself -- the recommended action is a suggestion the staff
 * member acts on elsewhere (the conversation/appointment pages), per the
 * task's "one recommendation, always a draft, never auto-sent" rule.
 */
export function PriorityCard({ item }: { item: PriorityItem }) {
  const [state, formAction, isPending] = useActionState(generateSalesBriefAction, initialState);
  const { customer, reasons, recommendedAction } = item;

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

      <div className="flex flex-wrap gap-1">
        {reasons.map((reason) => (
          <Badge key={reason.label} tone="muted" size="sm">
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

      <form action={formAction}>
        <input type="hidden" name="customerId" value={customer.id} />
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60"
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
