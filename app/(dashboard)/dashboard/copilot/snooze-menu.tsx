"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { snoozePriorityItemAction, type SnoozeState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { useFocusTrap } from "../_components/use-focus-trap";
import type { CopilotActionType } from "@/lib/copilot-lifecycle";

const initialState: SnoozeState = {};

const PRESET_OPTIONS = [
  { value: "later_today", label: "Later today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "next_week", label: "Next week" },
] as const;

// Enough room for the three presets + the "Pick date/time" row; used to
// decide whether the popover fits below the trigger before opening it
// downward. Read from the real viewport at open-time (never a hardcoded
// page/viewport height) -- this is the popover's own maximum content
// height, not an assumption about how tall the page is.
const MENU_MAX_HEIGHT_PX = 260;
const VIEWPORT_MARGIN_PX = 16;

/**
 * "Remind me at this time" -- distinct from "Mark as handled." Own
 * `useActionState` (same pattern as the dismiss/brief forms on this
 * page), a small popover with the three quick presets plus a "Pick date/
 * time" custom option. The custom `<input type="datetime-local">`
 * resolves in the viewer's own browser-local timezone; its `onChange`
 * copies that into a hidden ISO-string field so the server never has to
 * guess which timezone a bare "2026-09-20T09:00" string means.
 *
 * Positioning follows the same open/close (Escape + click-outside) and
 * focus-trap convention already established by
 * knowledge/_components/row-actions-menu.tsx, plus a flip: if there
 * isn't enough room below the trigger for the popover's own height, it
 * opens upward instead of downward, capped at the actually-available
 * space either way. This is what keeps a card near the bottom of the
 * viewport from ever needing to paint past the Copilot content area's
 * own background -- see snooze-menu's positioning fix in STATE.md.
 */
export function SnoozeMenu({
  customerId,
  actionType,
  canSnooze,
  label = "Snooze",
}: {
  customerId: string;
  actionType: CopilotActionType;
  canSnooze: boolean;
  label?: string;
}) {
  const [state, formAction, isPending] = useActionState(snoozePriorityItemAction, initialState);
  const [open, setOpen] = useState(false);
  const [customPicking, setCustomPicking] = useState(false);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  function handleTriggerClick() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
      const spaceAbove = rect.top - VIEWPORT_MARGIN_PX;
      setPlacement(spaceBelow < MENU_MAX_HEIGHT_PX && spaceAbove > spaceBelow ? "up" : "down");
    }
    setOpen((value) => !value);
    setCustomPicking(false);
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={!canSnooze}
        title={canSnooze ? undefined : ROLE_DENIED_TITLE}
        aria-expanded={open}
        aria-haspopup="menu"
        className="ds-btn-label inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {label}
        <ChevronDown strokeWidth={1.75} className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>}
          role="menu"
          style={{ maxHeight: MENU_MAX_HEIGHT_PX }}
          className={`absolute right-0 z-20 flex w-56 flex-col gap-1 overflow-y-auto rounded-2xl border border-ds-border bg-ds-surface-elevated p-2 shadow-float ${
            placement === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {PRESET_OPTIONS.map((preset) => (
            <form key={preset.value} action={formAction}>
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="preset" value={preset.value} />
              <button
                type="submit"
                role="menuitem"
                disabled={isPending}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60"
              >
                {preset.label}
              </button>
            </form>
          ))}

          {customPicking ? (
            <form action={formAction} className="flex flex-col gap-1 border-t border-ds-border pt-1">
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="preset" value="custom" />
              <input type="hidden" name="until" id={`snooze-until-${customerId}-${actionType}`} />
              <input
                type="datetime-local"
                required
                aria-label="Custom snooze date and time"
                className="h-9 min-h-0 rounded-lg border border-ds-border-strong bg-ds-surface px-2 text-sm text-ds-text-primary"
                onChange={(event) => {
                  const hidden = document.getElementById(`snooze-until-${customerId}-${actionType}`) as HTMLInputElement | null;
                  if (hidden && event.currentTarget.value) {
                    hidden.value = new Date(event.currentTarget.value).toISOString();
                  }
                }}
              />
              <button
                type="submit"
                disabled={isPending}
                className="ds-btn-label inline-flex h-9 items-center justify-center rounded-lg bg-ds-primary px-3 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60"
              >
                {isPending ? "Snoozing…" : "Set"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCustomPicking(true)}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft"
            >
              Pick date/time…
            </button>
          )}

          {state.error ? (
            <span role="alert" className="text-2xs text-ds-danger">
              {state.error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
