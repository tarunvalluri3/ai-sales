"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { publishBusinessAction, type PublishBusinessState } from "../widget-settings/actions";
import type { AgentChange } from "@/lib/agent-snapshot";
import { Badge } from "./badge";
import { ROLE_DENIED_TITLE } from "./delete-button";
import { useFocusTrap } from "./use-focus-trap";
import { useToast } from "./toast";

/** Plain data from `getAgentPublishStatus()` (lib/agent-publish-status.ts), computed in the layout. */
export type PublishBarStatus = {
  isLive: boolean;
  hasUnpublishedChanges: boolean;
  changes: AgentChange[];
  changeCount: number;
};

const AREA_HEADING: Record<AgentChange["area"], string> = {
  business: "Business",
  persona: "Persona",
  branding: "Branding",
  capabilities: "AI capabilities",
  products: "Products",
  services: "Services",
  faqs: "FAQs",
  knowledge: "Knowledge",
};

const initialState: PublishBusinessState = {};
const DIALOG_ID = "publish-changes-dialog";

function groupByArea(changes: AgentChange[]): { area: AgentChange["area"]; items: AgentChange[] }[] {
  const groups = new Map<AgentChange["area"], AgentChange[]>();
  for (const change of changes) {
    groups.set(change.area, [...(groups.get(change.area) ?? []), change]);
  }
  return Array.from(groups, ([area, items]) => ({ area, items }));
}

/**
 * The agent's name, its Live / "Live · Unpublished changes" pill and, when the
 * draft differs from the live version, the "Publish changes (N)" button that
 * opens the review dialog (Draft -> Publish -> Live). This is the dashboard's
 * ONE publish control: the dialog submits the same `publishBusinessAction`
 * the onboarding "Publish agent" button does. org:admin only (the action
 * enforces it; the button is disabled for other roles).
 */
export function PublishBar({
  agentName,
  status,
  canPublish,
}: {
  agentName: string;
  /** Null when the status could not be loaded -- the bar then shows just the name rather than a wrong pill. */
  status: PublishBarStatus | null;
  canPublish: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(publishBusinessAction, initialState);
  // The action result that was already on screen when the dialog last opened.
  // A result is only "new" -- worth showing an error for, or closing on -- if
  // it differs from this, so reopening never replays an old failure or success.
  const [seenState, setSeenState] = useState<PublishBusinessState>(initialState);
  const justPublished = state.success === true && state !== seenState;
  const isDialogOpen = open && !justPublished;
  const freshResult = state !== seenState ? state : null;
  const panelRef = useFocusTrap(isDialogOpen);

  useEffect(() => {
    if (wasOpenRef.current && !isDialogOpen) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = isDialogOpen;
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDialogOpen, isPending]);

  // The layout re-renders with the fresh status on its own once the action's
  // revalidation lands (the pill drops "Unpublished changes"); this only confirms.
  useEffect(() => {
    if (justPublished) {
      toast({ title: "Changes are live", variant: "success" });
    }
  }, [justPublished, toast]);

  if (!status || !status.isLive) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-ds-text-primary">{agentName}</p>
        {status ? (
          <Badge tone="muted" size="sm">
            Not live
          </Badge>
        ) : null}
      </div>
    );
  }

  const groups = groupByArea(status.changes);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-ds-text-primary">{agentName}</p>
        <Badge tone={status.hasUnpublishedChanges ? "warning" : "success"} size="sm">
          {status.hasUnpublishedChanges ? "Live · Unpublished changes" : "Live"}
        </Badge>
      </div>

      {status.hasUnpublishedChanges ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isDialogOpen}
          aria-controls={DIALOG_ID}
          disabled={!canPublish}
          title={canPublish ? undefined : ROLE_DENIED_TITLE}
          onClick={() => {
            setSeenState(state);
            setOpen(true);
          }}
          className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Publish changes ({status.changeCount})
        </button>
      ) : null}

      {isDialogOpen ? (
        <>
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            disabled={isPending}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <div
            id={DIALOG_ID}
            ref={panelRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${DIALOG_ID}-title`}
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xl"
          >
            <div className="flex flex-col gap-1">
              <h2 id={`${DIALOG_ID}-title`} className="text-lg font-semibold text-ds-text-primary">
                Publish changes
              </h2>
              <p className="text-sm text-ds-text-secondary">
                These changes go live on your website widget, WhatsApp and Instagram. Until you publish, customers
                keep seeing the current live version.
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {groups.map((group) => (
                <li key={group.area} className="flex flex-col gap-1">
                  <p className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                    {AREA_HEADING[group.area]}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((change) => (
                      <li key={change.label} className="text-sm text-ds-text-primary">
                        {change.label}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            {freshResult?.error ? (
              <div role="alert" className="flex flex-col gap-1.5 rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
                <p>{freshResult.error}</p>
                {freshResult.blockingItems && freshResult.blockingItems.length > 0 ? (
                  <ul className="list-disc pl-4">
                    {freshResult.blockingItems.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                ) : null}
                <p>Your live agent is unchanged and keeps running on the last published version.</p>
              </div>
            ) : null}

            <form action={formAction} className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="rounded-ds-sm px-3 py-2 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {isPending ? "Publishing…" : "Publish"}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
