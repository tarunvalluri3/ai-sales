"use client";

import { MessageCircle } from "lucide-react";
import { Badge } from "../../dashboard/_components/badge";
import { useOnboardingPreview } from "./preview-context";

/**
 * The right-hand "live agent preview" (collapsible on mobile via
 * `WizardShell`). A mock of the chat widget, not the real widget embed --
 * it never calls the AI, so it stays instant while the business is still
 * mid-setup and may have nothing retrievable yet.
 */
export function OnboardingPreviewPanel() {
  const { preview } = useOnboardingPreview();
  const percent =
    preview.essentialsTotal > 0 ? Math.round((preview.essentialsDone / preview.essentialsTotal) * 100) : 0;
  const greeting =
    preview.greeting?.trim() ||
    `Hi! Welcome to ${preview.businessName || "your business"}. How can I help today?`;

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ds-text-primary">Readiness</p>
          <span className="text-xs text-ds-text-muted">
            {preview.essentialsDone} of {preview.essentialsTotal} essentials done
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup essentials completed"
          className="h-2 w-full overflow-hidden rounded-full bg-ds-surface-elevated"
        >
          <div className="h-full rounded-full bg-ds-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-ds-border bg-ds-surface-elevated px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ds-accent text-ds-accent-on">
              <MessageCircle aria-hidden className="size-3.5" />
            </span>
            <span className="text-sm font-semibold text-ds-text-primary">
              {preview.businessName || "Your AI sales employee"}
            </span>
          </div>
          <Badge tone="muted" size="sm">
            Draft
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <div className="max-w-[85%] rounded-ds-md bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary">
            {greeting}
          </div>

          {preview.firstFaqQuestion ? (
            <>
              <div className="ml-auto max-w-[85%] rounded-ds-md bg-ds-accent-soft-bg px-3 py-2 text-sm text-ds-text-primary">
                {preview.firstFaqQuestion}
              </div>
              <div className="max-w-[85%] rounded-ds-md bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary">
                {preview.firstFaqAnswer}
              </div>
            </>
          ) : preview.firstProductName ? (
            <>
              <div className="ml-auto max-w-[85%] rounded-ds-md bg-ds-accent-soft-bg px-3 py-2 text-sm text-ds-text-primary">
                Do you have {preview.firstProductName}?
              </div>
              <div className="max-w-[85%] rounded-ds-md bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary">
                Yes, we do! Want me to tell you more about {preview.firstProductName}?
              </div>
            </>
          ) : (
            <p className="rounded-ds-md border border-dashed border-ds-border px-3 py-6 text-center text-xs text-ds-text-muted">
              Add a product, service or FAQ and a sample conversation will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
