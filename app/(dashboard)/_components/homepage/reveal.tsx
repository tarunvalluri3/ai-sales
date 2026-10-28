"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// The "easeOutExpo"-shaped curve used across Vercel/Stripe/Linear-style
// marketing sites: fast out of the gate, a long smooth settle, no bounce.
const REVEAL_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Fade/rise/soften entrance on scroll-into-view, disabled under
 * prefers-reduced-motion. The slight starting blur is what gives the
 * reveal its "coming into focus" feel rather than a flat slide.
 */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: REVEAL_EASE }}
    >
      {children}
    </motion.div>
  );
}
