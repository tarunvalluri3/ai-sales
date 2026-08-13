"use client";

import { forwardRef } from "react";

export const LauncherButton = forwardRef<
  HTMLButtonElement,
  { isOpen: boolean; onToggle: () => void }
>(function LauncherButton({ isOpen, onToggle }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={isOpen ? "Close chat" : "Open chat"}
      onClick={onToggle}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-widget-primary text-widget-on-primary shadow-lg transition-colors hover:bg-widget-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
    >
      {isOpen ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6L18 18M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 5.5C4 4.67157 4.67157 4 5.5 4H18.5C19.3284 4 20 4.67157 20 5.5V15.5C20 16.3284 19.3284 17 18.5 17H9L5 20.5V17H5.5C4.67157 17 4 16.3284 4 15.5V5.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
});
