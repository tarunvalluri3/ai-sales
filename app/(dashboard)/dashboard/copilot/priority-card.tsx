"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { generateSalesBriefAction, type GenerateBriefState } from "./actions";
import { SnoozeMenu } from "./snooze-menu";
import { MarkAsHandledButton } from "./mark-handled-button";
import { Avatar, ChannelIcon, Pill, btnOutlineSm, btnPrimarySm, type PillTone } from "../_components/ui";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { LeadQualification } from "@/lib/supabase/types";
import type { TodayActionItem } from "@/lib/copilot-actions";
import { displayContactName } from "@/lib/lead-source";

const initialState: GenerateBriefState = {};

/** What a card hands up to `TodayBoard` once its brief has been generated. */
export type GeneratedBrief = {
  customerId: string;
  customerName: string;
  header: string;
  narrative: string;
};

const QUALIFICATION_TONE: Record<LeadQualification, PillTone> = {
  hot: "amber",
  warm: "amber",
  cold: "gray",
};

/**
 * One "today" item -- backed by a `copilot_actions` row (Phase 30 v2),
 * reconciled from the same deterministic signals v1 always used. Shows the
 * stable action title, why it is prioritized (live reason chips), and the
 * one recommended next step -- never a list of options.
 *
 * Button hierarchy: "Open conversation" is the card's one primary action
 * (filled on the highlighted card, outlined otherwise); "Mark as handled"
 * and "Snooze" are secondary; "Generate brief" is the quiet link in the
 * top-right corner, and its result is shown in the board's side panel.
 *
 * "Mark as handled" (`canManage`, `org:sales_agent` minimum) keeps using the
 * original v1 `copilot_dismissals` mechanism unchanged (reason-key
 * suppression, 7-day expiry, "Recently handled" Undo) -- see lib/copilot.ts.
 * "Snooze" is distinct: "remind me at this time," not "I dealt with this."
 */
export function PriorityCard({
  item,
  canManage,
  onBrief,
  highlighted = false,
}: {
  item: TodayActionItem;
  canManage: boolean;
  /** Called with the generated brief so the board can show it in its side panel. */
  onBrief?: (brief: GeneratedBrief) => void;
  highlighted?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(generateSalesBriefAction, initialState);
  const { customer, reasons, recommendedAction, title } = item;
  const customerName = displayContactName(customer.displayName) ?? "Unnamed prospect";

  useEffect(() => {
    if (state.narrative && state.header) {
      onBrief?.({ customerId: customer.id, customerName, header: state.header, narrative: state.narrative });
    }
    // onBrief is a stable callback from the board; only re-run when the
    // action produces a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-3xl border bg-ds-surface p-5 ${
        highlighted ? "border-ds-lime pl-7" : "border-ds-border"
      }`}
    >
      {highlighted ? <span aria-hidden="true" className="absolute inset-y-4 left-3 w-1.5 rounded-full bg-ds-primary" /> : null}

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <Avatar name={customer.displayName} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/dashboard/customers/${customer.id}`}
            className="w-fit rounded-md text-sm font-medium text-ds-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            {customerName}
          </Link>
          <span className="flex items-center gap-2 text-sm text-ds-text-primary">
            <ChannelIcon source={customer.latestChannel} website="globe" className="size-4 shrink-0" />
            {channelLabel(customer.latestChannel)}
            {customer.latestLead ? ` · Lead score ${customer.latestLead.score}/${MAX_LEAD_SCORE}` : ""}
          </span>
        </div>
        {customer.latestLead ? (
          <span className="flex items-center gap-2">
            <Pill tone={QUALIFICATION_TONE[customer.latestLead.qualification]} className="font-medium capitalize">
              {customer.latestLead.qualification}
            </Pill>
            <Pill tone="gray" size="sm">
              AI-assessed
            </Pill>
          </span>
        ) : null}
        <form action={formAction} className="flex items-center">
          <input type="hidden" name="customerId" value={customer.id} />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-ds-primary underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {isPending ? "Generating…" : state.narrative ? "Regenerate brief" : "Generate brief"}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-base leading-snug font-medium text-ds-text-primary">{title}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ds-text-primary">Reason:</span>
          {reasons.map((reason, index) => (
            <Pill key={reason.key} tone={index === 0 ? "amber" : "gray"} size="sm">
              {reason.label}
            </Pill>
          ))}
        </div>

        <p className="text-sm text-ds-text-primary">
          <span className="font-medium">Recommended action: </span>
          {recommendedAction}
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/customers/${customer.id}`} className={`${highlighted ? btnPrimarySm : btnOutlineSm} h-10 min-w-52`}>
          <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden="true" />
          Open conversation
        </Link>

        <MarkAsHandledButton customerId={customer.id} reasonKeys={reasons.map((reason) => reason.key)} canManage={canManage} />

        <SnoozeMenu customerId={customer.id} actionType={item.actionType} canSnooze={canManage} />
      </div>
    </div>
  );
}
