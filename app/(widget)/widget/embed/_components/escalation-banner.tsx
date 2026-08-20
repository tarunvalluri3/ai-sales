"use client";

import { motion, useReducedMotion } from "motion/react";

export function EscalationBanner({ text }: { text: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mt-1.5 flex max-w-[85%] items-start gap-1.5 rounded-xl border border-widget-human-bubble-border bg-widget-human-bubble-bg px-3 py-2 text-xs leading-relaxed text-widget-human-accent"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path
          d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>{text}</span>
    </motion.div>
  );
}
