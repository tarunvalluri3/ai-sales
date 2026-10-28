"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Full-bleed ambient dot grid behind the homepage content -- fixed (so it
 * never scrolls with the page, giving it a stationary, parallax-like feel
 * for free), drawn entirely in existing `ds-*` tokens (no color, no blur,
 * no gradient wash). A second, brighter copy is masked to a soft circle
 * that follows the pointer, driven by CSS custom properties set directly on
 * the node (no React re-render per mousemove) and throttled to one update
 * per animation frame. A slow, near-imperceptible background-position drift
 * adds life while idle. Both the pointer-follow and the drift are skipped
 * under prefers-reduced-motion -- the grid still renders, just static.
 */
export function DotGridBackground() {
  const reactiveRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const node = reactiveRef.current;
    if (!node) return;

    let frame: number | null = null;
    let nextX = 0;
    let nextY = 0;

    function handlePointerMove(event: PointerEvent) {
      nextX = event.clientX;
      nextY = event.clientY;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        node!.style.setProperty("--dot-mx", `${nextX}px`);
        node!.style.setProperty("--dot-my", `${nextY}px`);
        frame = null;
      });
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className={`absolute inset-0 opacity-[0.22] [background-image:radial-gradient(var(--ds-border-strong)_1px,transparent_1px)] [background-size:28px_28px] ${
          reducedMotion ? "" : "animate-dot-drift"
        }`}
      />
      {!reducedMotion ? (
        <div
          ref={reactiveRef}
          className="absolute inset-0 opacity-50 [background-image:radial-gradient(var(--ds-accent-muted)_1px,transparent_1px)] [background-size:28px_28px]"
          style={
            {
              "--dot-mx": "-500px",
              "--dot-my": "-500px",
              maskImage: "radial-gradient(360px circle at var(--dot-mx) var(--dot-my), black, transparent 70%)",
              WebkitMaskImage:
                "radial-gradient(360px circle at var(--dot-mx) var(--dot-my), black, transparent 70%)",
            } as CSSProperties
          }
        />
      ) : null}
    </div>
  );
}
