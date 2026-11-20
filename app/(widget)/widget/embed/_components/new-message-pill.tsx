"use client";

/**
 * Widget reliability item 6: shown when a new message arrives while the
 * visitor has scrolled up; jumps to the newest message. Announced politely to
 * screen readers by the message log itself, so this is a plain button.
 */
export function NewMessagePill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 bg-widget-primary px-3 py-1.5 text-xs font-medium text-widget-on-primary shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_4px_12px_rgba(0,0,0,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
