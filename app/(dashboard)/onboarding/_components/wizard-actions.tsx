"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { btnGhost, btnPrimary } from "../../dashboard/_components/ui";

export function WizardActions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="onboarding-actions">
      {onBack ? (
        <button type="button" onClick={onBack} className={btnGhost}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      ) : null}
      {children}
    </div>
  );
}

type ContinueProps = Pick<ComponentPropsWithoutRef<"button">, "type" | "form" | "onClick" | "disabled"> & {
  label?: string;
  pending: boolean;
  pendingLabel?: string;
  reason?: string;
};

export function WizardContinue({
  label = "Continue",
  pending,
  pendingLabel = "Saving…",
  reason,
  disabled,
  type = "button",
  ...buttonProps
}: ContinueProps) {
  const hint = useId();

  return (
    <>
      {reason ? <p id={hint} className="onboarding-action-reason text-xs text-ds-text-secondary">{reason}</p> : null}
      <button
        {...buttonProps}
        type={type}
        disabled={disabled || pending}
        aria-describedby={reason ? hint : undefined}
        aria-busy={pending}
        className={btnPrimary + " ml-auto"}
      >
        {pending ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden /> : null}
        {pending ? pendingLabel : label}
      </button>
    </>
  );
}
