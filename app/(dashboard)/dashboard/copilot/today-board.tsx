"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { PriorityCard, type GeneratedBrief } from "./priority-card";
import { SalesBrief } from "./sales-brief";
import { Card, linkAccent } from "../_components/ui";
import type { TodayActionItem } from "@/lib/copilot-actions";

/**
 * The Today view: the ranked action queue on the left and one "AI sales
 * brief" panel on the right. A brief is still generated on demand, per item,
 * by that item's own card (same Server Action as before); this only lifts
 * the result up so the most recently generated brief is shown in the side
 * panel instead of inside the card, and marks which card it belongs to.
 */
export function TodayBoard({ items, canManage }: { items: TodayActionItem[]; canManage: boolean }) {
  const [brief, setBrief] = useState<GeneratedBrief | null>(null);
  const handleBrief = useCallback((next: GeneratedBrief) => setBrief(next), []);

  // A brief for an item that has since left the queue is dropped from view.
  const activeBrief = brief && items.some((item) => item.customer.id === brief.customerId) ? brief : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ul className="flex min-w-0 flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <PriorityCard
              item={item}
              canManage={canManage}
              onBrief={handleBrief}
              highlighted={activeBrief ? activeBrief.customerId === item.customer.id : false}
            />
          </li>
        ))}
      </ul>

      <Card as="aside" aria-label="AI sales brief" className="flex flex-col gap-4 xl:sticky xl:top-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="dx-title flex items-center gap-3">
            <Sparkles className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            AI sales brief
          </h2>
          {activeBrief ? (
            <p className="text-sm text-ds-text-secondary">
              <Link href={`/dashboard/customers/${activeBrief.customerId}`} className="font-medium text-ds-primary underline underline-offset-4">
                {activeBrief.customerName}
              </Link>{" "}
              · Generated just now
            </p>
          ) : null}
        </div>

        {activeBrief ? (
          <>
            <SalesBrief header={activeBrief.header} narrative={activeBrief.narrative} />
            <Link href={`/dashboard/customers/${activeBrief.customerId}`} className={`${linkAccent} self-start`}>
              Read the original conversation
              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
            Choose &ldquo;Generate brief&rdquo; on an item to get a short AI read on that prospect: what happened, the risk, and a
            suggested next step.
          </p>
        )}
      </Card>
    </div>
  );
}
