"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

export type Faq = { q: string; a: ReactNode };

/** Accessible accordion; one item open at a time; height animates via grid rows. */
export function FaqList({ items }: { items: readonly Faq[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <ul className="divide-y divide-ds-border border-y border-ds-border">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={item.q}>
            <h3>
              <button
                type="button"
                id={`${base}-q${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-a${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left text-[16.5px] font-medium text-ds-text-primary"
              >
                {item.q}
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-ds-border transition-all duration-300 ${
                    isOpen ? "rotate-45 border-ds-text-primary bg-ds-text-primary text-ds-bg" : "text-ds-text-secondary"
                  }`}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </span>
              </button>
            </h3>
            <div id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`} className="site-accordion" data-open={isOpen}>
              <div>
                <div className="max-w-[720px] pb-6 text-[15px] leading-relaxed text-ds-text-secondary">{item.a}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
