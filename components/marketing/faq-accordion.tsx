"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type FaqItem = { question: string; answer: ReactNode };

/**
 * Hand-built accordion (no dependency, see Step-0 decision 1): native
 * `<button aria-expanded>`/`aria-controls`, height animated with `motion`,
 * final state shown instantly under prefers-reduced-motion.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const baseId = useId();

  return (
    <div className="flex flex-col divide-y divide-ds-border border-y border-ds-border">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `${baseId}-trigger-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div key={item.question}>
            <h3 className="m-0">
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-ds-text-primary transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-lg leading-none text-ds-text-muted transition-transform duration-200 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h3>

            {reducedMotion ? (
              <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!isOpen}>
                <p className="pb-4 text-sm text-ds-text-secondary">{item.answer}</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <p className="pb-4 text-sm text-ds-text-secondary">{item.answer}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            )}
          </div>
        );
      })}
    </div>
  );
}
