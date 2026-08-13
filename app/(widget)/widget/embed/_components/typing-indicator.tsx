"use client";

export function TypingIndicator() {
  return (
    <div
      className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-widget-assistant-bubble px-3.5 py-3"
      aria-hidden="true"
    >
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0s]" />
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0.15s]" />
      <span className="widget-typing-dot h-1.5 w-1.5 rounded-full bg-widget-muted [animation-delay:0.3s]" />
    </div>
  );
}
