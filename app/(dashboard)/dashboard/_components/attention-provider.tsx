"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchAttentionSnapshot } from "@/lib/dashboard-poll-client";
import { nextPollDelayMs, POLL_FAST_MS } from "@/lib/poll-cadence";

/**
 * TWO separate primitive contexts, deliberately, not one object-valued
 * context. A `{ attention, unread }` object literal would be a new reference
 * on every tick, so every consumer -- Sidebar, MobileNav, the header bell --
 * would re-render once per second forever. With primitives React bails out
 * when the value is unchanged, which is almost every tick.
 */
const AttentionCountContext = createContext<number>(0);
const UnreadNotificationCountContext = createContext<number>(0);

export function useAttentionCount(): number {
  return useContext(AttentionCountContext);
}

export function useUnreadNotificationCount(): number {
  return useContext(UnreadNotificationCountContext);
}

/**
 * Plays a short, low-gain notification chime via the Web Audio API --
 * synthesized, not an audio file, to avoid adding a binary asset or a
 * new dependency (Phase 15c). Any failure (no Web Audio support, a
 * suspended/blocked AudioContext) is caught and swallowed -- a missing
 * sound must never break the badge or anything else in the dashboard.
 */
function playAttentionChime(context: AudioContext) {
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  } catch {
    // A missing notification sound must never break dashboard functionality.
  }
}

/**
 * Owns the single, shared poll for the count of conversations needing
 * attention across the whole dashboard (Phase 15c) -- mounted once in
 * dashboard/layout.tsx, not duplicated per nav surface. Same
 * self-rescheduling poll shape as LiveConversationPanel: pause on
 * tab-hidden, immediate poll on resume, cleanup on unmount (only ever
 * unmounted by leaving /dashboard/* entirely).
 *
 * perf/reply-and-save-speed: a GET fetch (GET /api/dashboard/attention), no
 * longer a Server Action, so it never makes the owner's saves wait in the
 * Server Action queue; every second while a count changed in the last 30 s,
 * every five seconds otherwise (lib/poll-cadence.ts).
 *
 * The chime plays only when a count genuinely increases relative to
 * what this tab already knew, and never on the first poll after mount
 * (which would alarm on every login if a backlog already exists).
 *
 * As of 2026-10-21 this one tick also carries the unread-notification count
 * for the header bell. That was a deliberate choice over a second poll loop:
 * the project's standing rule is no new aggressive polling, and the extra
 * COUNT rides an existing partial index.
 */
export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousCountRef = useRef<number | null>(null);
  const previousUnreadRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  // When either count last changed; drives the 1 s / 5 s cadence.
  const lastChangeAtRef = useRef(0);

  const poll = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await fetchAttentionSnapshot();
      if (!isMountedRef.current) return;

      const attentionRose = previousCountRef.current !== null && result.attentionCount > previousCountRef.current;
      const unreadRose = previousUnreadRef.current !== null && result.unreadNotificationCount > previousUnreadRef.current;

      // One chime per tick at most. An AI escalation raises BOTH counts in the
      // same tick -- it flags the conversation and dispatches a notification --
      // so chiming per-counter would double-ring on the single most important
      // event there is.
      if ((attentionRose || unreadRose) && audioContextRef.current) {
        playAttentionChime(audioContextRef.current);
      }

      if (result.attentionCount !== previousCountRef.current || result.unreadNotificationCount !== previousUnreadRef.current) {
        lastChangeAtRef.current = Date.now();
      }
      previousCountRef.current = result.attentionCount;
      previousUnreadRef.current = result.unreadNotificationCount;
      setCount(result.attentionCount);
      setUnreadCount(result.unreadNotificationCount);
    } catch {
      // A poll failure is invisible to the user -- keep the last-known
      // count and try again on the next tick.
    }

    if (!isMountedRef.current) return;
    if (document.visibilityState === "visible") {
      timeoutRef.current = setTimeout(() => pollRef.current(), nextPollDelayMs(lastChangeAtRef.current, Date.now()));
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    isMountedRef.current = true;

    function handleFirstInteraction() {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext();
        } catch {
          // Web Audio not supported -- the badge still works without sound.
        }
      }
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    }
    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("keydown", handleFirstInteraction);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void pollRef.current();
      } else if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    lastChangeAtRef.current = Date.now();
    timeoutRef.current = setTimeout(() => pollRef.current(), POLL_FAST_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  return (
    <AttentionCountContext.Provider value={count}>
      <UnreadNotificationCountContext.Provider value={unreadCount}>{children}</UnreadNotificationCountContext.Provider>
    </AttentionCountContext.Provider>
  );
}
