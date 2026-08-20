"use client";

import { useState } from "react";
import type { Message } from "@/lib/supabase/types";
import { getCitationDetailsAction } from "../actions";
import type { CitedChunk } from "@/lib/knowledge";

const CAPTION: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

const CAPTION_STYLE: Record<Message["role"], string> = {
  user: "text-ds-text-muted",
  assistant: "text-ds-text-muted",
  human_agent: "font-semibold text-ds-accent-muted",
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";
  const hasCitations = message.source_chunk_ids.length > 0;

  const [expanded, setExpanded] = useState(false);
  const [citations, setCitations] = useState<CitedChunk[] | null>(null);
  const [loading, setLoading] = useState(false);

  const bubbleClassName = isUser
    ? "max-w-[85%] rounded-2xl rounded-br-md bg-ds-surface-soft px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-primary"
    : isHumanAgent
      ? "max-w-[85%] rounded-2xl rounded-bl-md bg-ds-accent-soft-bg px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-primary"
      : "max-w-[85%] rounded-2xl rounded-bl-md bg-ds-surface-elevated px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-secondary";

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
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={bubbleClassName}>{message.content}</div>
      <span className={`mt-1 text-2xs ${CAPTION_STYLE[message.role]}`}>
        {CAPTION[message.role]} · {new Date(message.created_at).toLocaleString("en-US")}
      </span>

      {hasCitations ? (
        <div className="mt-1 max-w-[85%]">
          <button
            type="button"
            onClick={toggleExpanded}
            className="text-2xs font-medium text-ds-accent-muted hover:underline"
          >
            {expanded ? "Hide sources" : `Sources (${message.source_chunk_ids.length})`}
          </button>
          {expanded ? (
            <div className="mt-1.5 flex flex-col gap-1.5 rounded-ds-md border border-ds-border bg-ds-surface-soft p-2.5">
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
