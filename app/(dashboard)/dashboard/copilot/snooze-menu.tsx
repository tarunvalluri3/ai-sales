"use client";

import { useActionState, useState } from "react";
import { snoozePriorityItemAction, type SnoozeState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import type { CopilotActionType } from "@/lib/copilot-lifecycle";

const initialState: SnoozeState = {};

const PRESET_OPTIONS = [
  { value: "later_today", label: "Later today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "next_week", label: "Next week" },
] as const;

/**
 * "Remind me at this time" -- distinct from "Mark as handled." Own
 * `useActionState` (same pattern as the dismiss/brief forms on this
 * page), a small popover with the three quick presets plus a "Pick date/
 * time" custom option. The custom `<input type="datetime-local">`
 * resolves in the viewer's own browser-local timezone; its `onChange`
 * copies that into a hidden ISO-string field so the server never has to
 * guess which timezone a bare "2026-09-20T09:00" string means.
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

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!canSnooze}
        title={canSnooze ? undefined : ROLE_DENIED_TITLE}
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label} ▾
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 z-10 mt-1 flex w-52 flex-col gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated p-2 shadow-lg">
          {PRESET_OPTIONS.map((preset) => (
            <form key={preset.value} action={formAction}>
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="preset" value={preset.value} />
              <button
                type="submit"
                role="menuitem"
                disabled={isPending}
                className="w-full rounded-ds-sm px-2 py-1 text-left text-xs text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60"
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
                className="rounded-ds-sm border border-ds-border bg-ds-surface px-1.5 py-1 text-xs text-ds-text-primary"
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
                className="rounded-ds-sm bg-ds-accent px-2 py-1 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent/90 disabled:opacity-60"
              >
                {isPending ? "Snoozing…" : "Set"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCustomPicking(true)}
              className="w-full rounded-ds-sm px-2 py-1 text-left text-xs text-ds-text-primary transition-colors hover:bg-ds-surface-soft"
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
