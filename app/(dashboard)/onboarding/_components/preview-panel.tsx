"use client";

import { Ellipsis, MessageCircle, Send } from "lucide-react";
import { DEFAULT_WIDGET_PRIMARY, readableOnColor } from "@/lib/widget-colors";
import { Card, Pill } from "../../dashboard/_components/ui";
import { useOnboardingPreview } from "./preview-context";

/** An instant sample of the draft widget, with no chat or model request. */
export function OnboardingPreviewPanel({ showTitle = true }: { showTitle?: boolean }) {
  const { preview } = useOnboardingPreview();
  const accent = preview.accent ?? DEFAULT_WIDGET_PRIMARY;
  const ink = readableOnColor(accent);
  const greeting =
    preview.greeting?.trim() ||
    "Hi! Welcome to " + (preview.businessName || "your business") + ". How can I help today?";
  const name = preview.agentName || preview.businessName || "Your AI sales employee";
  const product = preview.firstProductName;

  return (
    <figure className="mt-5 min-w-0 [overflow-wrap:anywhere]">
      <figcaption className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ds-text-primary">
          {showTitle ? "Live preview" : "Website widget"}
        </span>
        <Pill tone={preview.published ? "green" : "gray"}>{preview.published ? "Live" : "Draft"}</Pill>
      </figcaption>
      <Card as="div" padded={false} className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ds-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative grid size-8 shrink-0 place-items-center rounded-full" style={{ backgroundColor: accent, color: ink }}>
              {preview.agentAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- locally selected blob or tenant Storage URL.
                <img src={preview.agentAvatarUrl} alt="" className="size-full rounded-full object-cover" />
              ) : <MessageCircle aria-hidden className="size-4" />}
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-ds-surface" style={{ backgroundColor: accent }} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight text-ds-text-primary">{name}</p>
              <p className="text-xs text-ds-text-secondary">AI sales agent</p>
            </div>
          </div>
          <Ellipsis className="size-4 shrink-0 text-ds-text-secondary" aria-hidden />
        </div>

        <div className="flex max-h-72 min-h-36 flex-col gap-3 overflow-y-auto overscroll-contain bg-ds-bg p-4 text-sm text-ds-text-primary">
          <p className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-ds-surface-soft px-3 py-2">{greeting}</p>
          {preview.firstFaqQuestion ? (
            <>
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2" style={{ backgroundColor: accent, color: ink }}>
                {preview.firstFaqQuestion}
              </p>
              <p className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-ds-surface-soft px-3 py-2">{preview.firstFaqAnswer}</p>
            </>
          ) : product ? (
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2" style={{ backgroundColor: accent, color: ink }}>
              Tell me about {product}.
            </p>
          ) : (
            <p className="text-xs text-ds-text-secondary">Add a product, service or FAQ to see it here.</p>
          )}
        </div>

        <div className="border-t border-ds-border px-3 py-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-ds-border-strong py-1 pr-1 pl-3" aria-hidden>
            <span className="text-sm text-ds-text-secondary">Write a message…</span>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: accent, color: ink }}>
              <Send className="size-4" />
            </span>
          </div>
        </div>
      </Card>
      <p className="mt-2 text-xs text-ds-text-secondary">Sample conversation. Try a live test in the final step.</p>
    </figure>
  );
}
