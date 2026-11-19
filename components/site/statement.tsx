"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";

/*
 * A sentence that lights up word by word as it scrolls through the
 * viewport (opacity only). Words in `accent` light in lime.
 */
export function LitStatement({ text, accent = [] }: { text: string; accent?: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const [lit, setLit] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.82 - r.top) / (r.height + vh * 0.35)));
      setLit(Math.round(p * words.length));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, words.length]);

  return (
    <p ref={ref} className="site-h2 !text-[clamp(1.75rem,2.6vw+1rem,3.5rem)] !leading-[1.12]">
      {words.map((w, i) => {
        const on = reduced || i < lit;
        const isAccent = accent.includes(w.replace(/[.,]/g, ""));
        return (
          <span
            key={i}
            className="transition-opacity duration-300"
            style={{ opacity: on ? 1 : 0.3, color: isAccent ? "var(--ds-lime)" : undefined }}
          >
            {w}{" "}
          </span>
        );
      })}
    </p>
  );
}
