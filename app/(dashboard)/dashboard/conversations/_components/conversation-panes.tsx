"use client";

import { useState, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";

/**
 * The transcript card and the prospect-context card. From `xl:` up they sit
 * side by side; below that only one shows at a time and the round button in
 * the transcript's top-right corner swaps them (stacking them in one scroll
 * flow would push the composer out of reach under a growing info panel).
 * Both stay mounted at all times so `LiveConversationPanel`'s poll never
 * restarts on toggle: only `hidden`/`flex` changes.
 */
export function ConversationPanes({ transcript, infoPanel }: { transcript: ReactNode; infoPanel: ReactNode }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      <div className={`${showInfo ? "hidden" : "flex"} h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-ds-surface xl:flex`}>
        {transcript}
      </div>

      <button
        type="button"
        onClick={() => setShowInfo((value) => !value)}
        aria-label={showInfo ? "Back to chat" : "View prospect details"}
        title={showInfo ? "Back to chat" : "View prospect details"}
        className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary xl:hidden"
      >
        {showInfo ? <X strokeWidth={1.75} className="size-5" aria-hidden="true" /> : <PanelRight strokeWidth={1.75} className="size-5" aria-hidden="true" />}
      </button>

      <div
        className={`${showInfo ? "flex" : "hidden"} h-full min-h-0 w-full flex-col overflow-hidden border-l border-ds-border bg-ds-surface xl:flex xl:w-80 xl:shrink-0`}
      >
        {infoPanel}
      </div>
    </div>
  );
}
