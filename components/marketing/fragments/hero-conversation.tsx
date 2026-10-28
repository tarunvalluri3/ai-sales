"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Globe, MessageCircle, type LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { MicroChip, StatusRow } from "./_shared";

type ChannelId = "website" | "whatsapp" | "instagram";

const CHANNELS: { id: ChannelId; label: string; icon: LucideIcon }[] = [
  { id: "website", label: "Website", icon: Globe },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "instagram", label: "Instagram", icon: AtSign },
];

// Delay, in ms, from each stage to the next. Stage 0 (the prospect's
// question) renders immediately; there are 4 further stages, so 4 delays.
const STAGE_DELAYS_MS = [500, 900, 950, 950];
const FINAL_STAGE = STAGE_DELAYS_MS.length;

/**
 * Plays once when scrolled into view, replays on a channel-tab click, pauses
 * (stops scheduling) while offscreen, and jumps straight to the final state
 * under prefers-reduced-motion -- no endless loop in any case.
 */
export function HeroConversation() {
  const [channel, setChannel] = useState<ChannelId>("website");
  const [stage, setStage] = useState(0);
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Advance one stage at a time while in view. Going offscreen clears the
  // pending timer (pause); coming back schedules the next stage from where
  // the sequence left off, rather than restarting it. Reduced motion never
  // schedules a timer at all -- `effectiveStage` below jumps straight to the
  // final state instead of driving it through setState.
  useEffect(() => {
    if (reducedMotion) return;
    if (!inView || stage >= FINAL_STAGE) {
      clearTimer();
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setStage((current) => Math.min(current + 1, FINAL_STAGE));
    }, STAGE_DELAYS_MS[stage]);

    return clearTimer;
  }, [inView, stage, reducedMotion, clearTimer]);

  function handleChannelChange(next: ChannelId) {
    if (next === channel) return;
    setChannel(next);
    setStage(0);
  }

  const effectiveStage = reducedMotion ? FINAL_STAGE : stage;
  const showTyping = effectiveStage === 1;
  const showAnswer = effectiveStage >= 2;
  const showLead = effectiveStage >= 3;
  const showBooking = effectiveStage >= 4;

  return (
    <div ref={containerRef} className="w-full max-w-sm">
      <div
        role="tablist"
        aria-label="Channel"
        className="mb-3 flex gap-1 rounded-ds-sm border border-ds-border bg-ds-surface p-1"
      >
        {CHANNELS.map(({ id, label, icon: Icon }) => {
          const active = id === channel;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleChannelChange(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1.5 text-2xs font-medium tracking-wide-ds uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                active
                  ? "bg-ds-surface-elevated text-ds-text-primary"
                  : "text-ds-text-muted hover:text-ds-text-secondary"
              }`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="rounded-ds-lg border border-ds-border-strong bg-ds-surface p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
        <div className="mb-4 flex items-center gap-2 border-b border-ds-border pb-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-ds-accent text-xs font-semibold text-ds-accent-on">
            L
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ds-text-primary">Lumen Dental Studio</span>
            <span className="flex items-center gap-1.5 text-2xs text-ds-success">
              <span className="relative flex size-1.5">
                {!reducedMotion ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ds-success opacity-75" />
                ) : null}
                <span className="relative inline-flex size-1.5 rounded-full bg-ds-success" />
              </span>
              Online
            </span>
          </div>
        </div>

        <div className="flex min-h-[208px] flex-col gap-3">
          <ChatBubble tone="prospect">Do you have teeth whitening slots this week?</ChatBubble>

          {showTyping ? <TypingBubble /> : null}

          {showAnswer ? (
            <div className="flex flex-col items-start gap-1.5">
              <ChatBubble tone="ai">
                Yes — we have whitening slots Thursday and Friday afternoon, based on our current price
                list.
              </ChatBubble>
              <MicroChip>SOURCE · Price List</MicroChip>
            </div>
          ) : null}

          {showLead ? (
            <StatusRow label="Lead captured · Warm" detail="Asked about pricing and availability" />
          ) : null}

          {showBooking ? (
            <div className="flex items-center justify-between gap-2 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2">
              <span className="text-2xs font-medium text-ds-text-primary">Appointment booked</span>
              <span className="font-mono text-2xs text-ds-text-secondary">Thu · 4:30 PM</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ tone, children }: { tone: "prospect" | "ai"; children: string }) {
  const isProspect = tone === "prospect";
  return (
    <div
      className={`max-w-[85%] rounded-ds-md px-3 py-2 text-xs text-ds-text-primary ${
        isProspect
          ? "self-start rounded-tl-sm bg-ds-surface-elevated"
          : "self-start rounded-tl-sm bg-ds-accent-soft-bg"
      }`}
    >
      {children}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex w-fit items-center gap-1 self-start rounded-ds-md rounded-tl-sm bg-ds-surface-elevated px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-ds-text-muted"
          style={{ animationDelay: `${i * 0.12}s` }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Typing…</span>
    </div>
  );
}
