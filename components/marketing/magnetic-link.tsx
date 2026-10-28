"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

const MotionLink = motion.create(Link);

const MAX_OFFSET = 10;
const SPRING = { stiffness: 300, damping: 20, mass: 0.5 };

/**
 * A primary CTA that leans gently toward the pointer within its own bounds
 * and springs back on leave -- reserved for the one or two calls to action
 * that should feel alive, not applied broadly. No-ops to a plain `Link`
 * under prefers-reduced-motion.
 */
export function MagneticLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);

  if (reducedMotion) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = event.clientX - (rect.left + rect.width / 2);
    const relY = event.clientY - (rect.top + rect.height / 2);
    x.set((relX / rect.width) * MAX_OFFSET * 2);
    y.set((relY / rect.height) * MAX_OFFSET * 2);
  }

  function handlePointerLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <MotionLink
      ref={ref}
      href={href}
      className={className}
      style={{ x: springX, y: springY }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </MotionLink>
  );
}
