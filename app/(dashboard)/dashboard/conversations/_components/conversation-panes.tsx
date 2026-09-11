"use client";

import { useState, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";

/**
 * Splits the transcript and info panel on mobile (2026-09-11 fixed-shell
 * follow-up) -- stacking them in one scroll flow doesn't compose with a
 * genuinely fixed chat shell (the composer needs to stay reachable
 * without scrolling past a growing info panel below it). Both panes stay
 * mounted at all times (so `LiveConversationPanel`'s poll never restarts
 * on toggle) -- only visibility (`hidden`/`flex`) changes below `md:`,
 * where both are always shown side by side regardless of this state.
 */
export function ConversationPanes({ transcript, infoPanel }: { transcript: ReactNode; infoPanel: ReactNode }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-row overflow-hidden">
      <div className={`${showInfo ? "hidden" : "flex"} h-full min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        {transcript}
      </div>

      <button
        type="button"
        onClick={() => setShowInfo((value) => !value)}
        aria-label={showInfo ? "Back to chat" : "View prospect details"}
        title={showInfo ? "Back to chat" : "View prospect details"}
        className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-ds-surface-elevated text-ds-text-secondary shadow-md transition-colors hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent md:hidden"
      >
        {showInfo ? <X className="size-4" aria-hidden="true" /> : <PanelRight className="size-4" aria-hidden="true" />}
      </button>

      <div className={`${showInfo ? "flex" : "hidden"} h-full min-h-0 w-full flex-col md:flex md:w-80 md:shrink-0`}>
        {infoPanel}
      </div>
    </div>
  );
}
