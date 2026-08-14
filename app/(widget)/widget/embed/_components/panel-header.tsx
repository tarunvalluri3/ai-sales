"use client";

export function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-widget-header-bg px-4 py-3.5 text-widget-header-fg">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-widget-primary text-widget-on-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3a1 1 0 0 1 1 1v1.07A6 6 0 0 1 18.93 11H20a1 1 0 1 1 0 2h-1.07A6 6 0 0 1 13 18.93V20a1 1 0 1 1-2 0v-1.07A6 6 0 0 1 5.07 13H4a1 1 0 1 1 0-2h1.07A6 6 0 0 1 11 5.07V4a1 1 0 0 1 1-1Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              fill="currentColor"
            />
          </svg>
          <span
            aria-hidden="true"
            className="widget-status-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-widget-header-bg bg-widget-primary"
          />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">AI Sales Assistant</span>
          <span className="truncate text-[11px] text-widget-header-fg-muted">Usually replies in seconds</span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6L18 18M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
