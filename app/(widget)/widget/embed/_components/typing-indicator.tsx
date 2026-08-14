"use client";

import { motion, useReducedMotion } from "motion/react";

export function TypingIndicator() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-widget-assistant-bubble px-3.5 py-3"
      aria-hidden="true"
    >
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0s]" />
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0.15s]" />
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0.3s]" />
    </motion.div>
  );
}
