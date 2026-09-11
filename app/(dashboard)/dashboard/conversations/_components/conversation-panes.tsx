"use client";

import { useState, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";

/**
 * Splits the transcript and info panel on mobile -- stacking them in one
 * scroll flow doesn't compose with a genuinely fixed chat shell (the
 * composer needs to stay reachable without scrolling past a growing
 * info panel below it). Both panes stay mounted at all times (so
 * `LiveConversationPanel`'s poll never restarts on toggle) -- only
 * visibility (`hidden`/`flex`) changes below `md:`, where both are
 * always shown side by side regardless of this state.
 *
 * Pins itself to the viewport via `sticky top-0 h-screen self-start` at
 * every breakpoint, independent of its parent (`conversations/layout.tsx`'s
 * `{children}` wrapper is only bounded from `md:` up) -- the same
 * "each pane pins itself, no ancestor needs to cooperate" principle
 * `Sidebar`/`ChatListPane` already use.
 */
export function ConversationPanes({ transcript, infoPanel }: { transcript: ReactNode; infoPanel: ReactNode }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="sticky top-0 flex h-screen flex-1 flex-row self-start overflow-hidden">
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

      <div
        className={`${showInfo ? "flex" : "hidden"} h-full min-h-0 w-full flex-col border-ds-border bg-ds-bg md:flex md:w-80 md:shrink-0 md:border-l`}
      >
        {infoPanel}
      </div>
    </div>
  );
}
