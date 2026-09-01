"use client";

import type { WidgetRecommendedProduct } from "../_lib/post-message";

/**
 * Phase B1 (STATE.md, "AI sales agent, not chatbot"): renders items the
 * recommend_products tool returned, captured server-side from the tool's
 * own result (never restated by the model) -- see lib/rag.ts's
 * SalesEmployeeResponse doc comment for why this is trustworthy.
 */
export function ProductRecommendationCards({ items }: { items: WidgetRecommendedProduct[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex w-36 flex-col gap-1 rounded-xl border border-widget-border-strong bg-widget-surface p-2"
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary business-supplied catalog image URL
            <img src={item.imageUrl} alt="" className="h-20 w-full rounded-lg object-cover" />
          ) : null}
          <span className="text-xs font-medium text-widget-foreground">{item.name}</span>
          {item.priceDisplay ? <span className="text-[11px] text-widget-muted">{item.priceDisplay}</span> : null}
        </div>
      ))}
    </div>
  );
}
