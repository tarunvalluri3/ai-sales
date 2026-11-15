"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Message } from "@/lib/supabase/types";
import { getCitationDetailsAction } from "../actions";
import type { CitedChunk } from "@/lib/knowledge";

/** Shared across the transcript bubbles and the conversations list preview line -- keep both in sync. */
export const MESSAGE_ROLE_LABEL: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

const BUBBLE_STYLE: Record<Message["role"], string> = {
  user: "rounded-bl-md bg-ds-surface-soft text-ds-text-primary",
  assistant: "rounded-br-md bg-ds-primary/10 text-ds-text-primary",
  human_agent: "rounded-br-md bg-ds-primary text-ds-primary-on",
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";
  const hasCitations = message.source_chunk_ids.length > 0;

  const [expanded, setExpanded] = useState(false);
  const [citations, setCitations] = useState<CitedChunk[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Inbox convention: the prospect speaks from the left; the business's own
  // side (the AI, and a team member in olive) answers from the right.
  const bubbleClassName = `max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${BUBBLE_STYLE[message.role]}`;

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && citations === null && !loading) {
      setLoading(true);
      try {
        const result = await getCitationDetailsAction(message.source_chunk_ids);
        setCitations(result);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}>
      <div className={bubbleClassName}>{message.content}</div>
      <span className={`mt-1.5 text-xs ${isHumanAgent ? "font-medium text-ds-text-primary" : "text-ds-text-secondary"}`}>
        {MESSAGE_ROLE_LABEL[message.role]} · {new Date(message.created_at).toLocaleString("en-US")}
      </span>

      {hasCitations ? (
        <div className={`mt-1 flex max-w-[82%] flex-col ${isUser ? "items-start" : "items-end"}`}>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-ds-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            {expanded ? "Hide sources" : `Sources (${message.source_chunk_ids.length})`}
            <ChevronDown strokeWidth={1.75} className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {expanded ? (
            <div className="mt-1.5 flex flex-col gap-2 rounded-xl bg-ds-surface-soft p-3 text-left">
              {loading ? (
                <p className="text-2xs text-ds-text-muted">Loading…</p>
              ) : citations && citations.length > 0 ? (
                citations.map((citation) => (
                  <div key={citation.id} className="text-2xs text-ds-text-secondary">
                    <p className="font-medium text-ds-text-primary">{citation.documentTitle}</p>
                    <p className="line-clamp-3">{citation.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-2xs text-ds-text-muted">
                  This source is no longer available — the underlying knowledge may have since been edited or removed.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
