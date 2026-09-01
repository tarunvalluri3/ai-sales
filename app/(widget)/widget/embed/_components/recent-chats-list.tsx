"use client";

import type { RecentChatSummary } from "../_lib/use-widget-chat";
import type { WidgetStrings } from "@/lib/widget-i18n";

export function RecentChatsList({
  strings,
  conversations,
  isLoading,
  onBack,
  onSelect,
}: {
  strings: WidgetStrings;
  conversations: RecentChatSummary[] | null;
  isLoading: boolean;
  onBack: () => void;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-widget-border-strong px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-widget-foreground transition-colors hover:bg-widget-assistant-bubble focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
          aria-label={strings.backLabel}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-sm font-semibold text-widget-foreground">{strings.recentChatsTitle}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-widget-muted">{strings.recentChatsLoading}</p>
        ) : !conversations || conversations.length === 0 ? (
          <p className="px-2 py-3 text-sm text-widget-muted">{strings.recentChatsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-widget-assistant-bubble"
                >
                  <span className="truncate text-sm text-widget-foreground">
                    {conversation.preview || strings.panelTitle}
                  </span>
                  <span className="text-[11px] text-widget-muted">
                    {new Date(conversation.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
