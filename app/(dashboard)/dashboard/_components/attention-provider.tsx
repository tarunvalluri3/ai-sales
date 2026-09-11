"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pollAttentionCountAction, type AttentionCounts } from "../actions";

const POLL_INTERVAL_MS = 1000;

const INITIAL_COUNTS: AttentionCounts = { conversationsNeedingAttention: 0, pendingAppointments: 0 };

const AttentionCountContext = createContext<AttentionCounts>(INITIAL_COUNTS);

export function useAttentionCounts(): AttentionCounts {
  return useContext(AttentionCountContext);
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
 * Owns the single, shared poll for the dashboard's two live nav badges --
 * conversations needing attention (Phase 15c) and, since 2026-09-11,
 * pending appointment requests -- one poll backing both, not two
 * independent timers. Mounted once in dashboard/layout.tsx. Same
 * self-rescheduling poll shape as LiveConversationPanel: pause on
 * tab-hidden, immediate poll on resume, cleanup on unmount.
 *
 * The chime plays when *either* count genuinely increases relative to
 * what this tab already knew, and never on the first poll after mount
 * (which would alarm on every login if a backlog already exists).
 */
export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<AttentionCounts>(INITIAL_COUNTS);
  const previousCountsRef = useRef<AttentionCounts | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await pollAttentionCountAction();
      if (!isMountedRef.current) return;

      const previous = previousCountsRef.current;
      const increased =
        previous !== null &&
        (result.conversationsNeedingAttention > previous.conversationsNeedingAttention ||
          result.pendingAppointments > previous.pendingAppointments);
      if (increased && audioContextRef.current) {
        playAttentionChime(audioContextRef.current);
      }
      previousCountsRef.current = result;
      setCounts(result);
    } catch {
      // A poll failure is invisible to the user -- keep the last-known
      // counts and try again on the next tick.
    }

    if (!isMountedRef.current) return;
    if (document.visibilityState === "visible") {
      timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
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
          // Web Audio not supported -- the badges still work without sound.
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

    timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  return <AttentionCountContext.Provider value={counts}>{children}</AttentionCountContext.Provider>;
}
