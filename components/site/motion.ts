"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/*
 * Motion primitives for the public site. One small set, shared by every
 * illustration, so timing and reduced-motion behaviour can't drift between
 * sections. No animation library: IntersectionObserver + CSS transitions.
 */

const RM_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** Reactive prefers-reduced-motion (false during SSR). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

/** `inView` tracks visibility (pauses loops off-screen); `seen` latches true. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "0px 0px -12% 0px" }: { rootMargin?: string } = {},
): { inView: boolean; seen: boolean } {
  const [state, setState] = useState({ inView: false, seen: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setState((prev) => ({
          inView: entry.isIntersecting,
          seen: prev.seen || entry.isIntersecting,
        })),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return state;
}

/**
 * Steps through `durations` (ms per step) while `running`. Loops by default.
 * Under reduced motion it holds the last (finished) frame, so every
 * illustration still shows its complete story as a still.
 */
export function useSequence(durations: readonly number[], running: boolean, { loop = true } = {}): number {
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = durations.length;
  const reduced = useReducedMotion();
  const stepRef = useRef(0);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (reduced || !running) return undefined;
    const tick = (i: number) => {
      timer.current = setTimeout(() => {
        const next = i + 1;
        if (next >= count) {
          if (!loop) return;
          setStep(0);
          tick(0);
        } else {
          setStep(next);
          tick(next);
        }
      }, durations[i]);
    };
    tick(stepRef.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // durations is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, count, loop, reduced]);

  return reduced ? count - 1 : step;
}

/** Sets --mx/--my on the element for the .site-spot border highlight. */
export function trackSpot(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
}
