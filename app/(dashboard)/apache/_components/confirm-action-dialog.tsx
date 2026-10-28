"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/app/(dashboard)/dashboard/_components/use-focus-trap";
import type { ActionResult } from "@/lib/admin-tenant-actions";

/**
 * Shared confirm-dialog-with-reason for every destructive /apache admin
 * action (approved security brief: "each needs a confirm dialog, a reason
 * field, and an audit log entry" -- the audit entry is written server-side
 * by the action itself, this component owns the confirm+reason UI). Same
 * modal shell as app/(dashboard)/dashboard/_components/contact-email-gate.tsx.
 *
 * `confirmText` (optional): when set, the submit button stays disabled
 * until the admin types this exact string into a second field -- the
 * "type the tenant's name to confirm" pattern for hard delete.
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmText,
  dangerous = false,
  onConfirm,
  extraFields,
  extraValid = true,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  description: string;
  confirmText?: string;
  dangerous?: boolean;
  onConfirm: (reason: string) => Promise<ActionResult>;
  /** Extra inputs rendered between the title and the reason field, for an action that needs more than a reason (extend trial's day count, change plan's target plan, etc.) -- the caller owns their own state and reads it when building `onConfirm`. */
  extraFields?: React.ReactNode;
  /** When `extraFields` is present, the caller can disable Confirm until its own fields are valid (e.g. a plan actually selected). */
  extraValid?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const panelRef = useFocusTrap(isOpen);

  function close() {
    setIsOpen(false);
    setReason("");
    setTypedConfirm("");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm(reason);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const confirmMismatch = confirmText !== undefined && typedConfirm !== confirmText;

  return (
    <>
      {trigger(() => setIsOpen(true))}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-action-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ds-bg/80 p-4 backdrop-blur-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div
            ref={panelRef as React.RefObject<HTMLDivElement>}
            className="flex w-full max-w-md flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-6 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${dangerous ? "text-ds-danger" : "text-ds-warning"}`} aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <h2 id="confirm-action-dialog-title" className="text-base font-semibold text-ds-text-primary">
                  {title}
                </h2>
                <p className="text-sm text-ds-text-secondary">{description}</p>
              </div>
            </div>

            {extraFields}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ds-text-primary">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                placeholder="Why are you doing this?"
              />
            </label>

            {confirmText !== undefined ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ds-text-primary">
                  Type <span className="font-mono text-ds-danger">{confirmText}</span> to confirm
                </span>
                <input
                  value={typedConfirm}
                  onChange={(e) => setTypedConfirm(e.target.value)}
                  className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                />
              </label>
            ) : null}

            {error ? <p className="text-sm text-ds-danger">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-ds-sm px-3 py-1.5 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || reason.trim().length < 3 || confirmMismatch || !extraValid}
                className={`rounded-ds-sm px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                  dangerous
                    ? "bg-ds-danger text-ds-danger-on hover:opacity-90"
                    : "bg-dashboard-primary text-dashboard-on-primary hover:bg-dashboard-primary-hover"
                }`}
              >
                {isPending ? "Working..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
