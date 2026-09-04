"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { updateAiCapabilitiesAction, type AiCapabilitiesActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: AiCapabilitiesActionState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

/**
 * Replaces the old exclusive "AI conversion goal" dropdown (Phase B1) with
 * independent capability toggles -- request_callback (lead capture) was
 * never actually gated by that dropdown, so framing recommend_products vs.
 * appointments as one exclusive "goal" was never accurate. Both toggles
 * combine: lib/rag.ts's formatCapabilityChainingInstruction makes the AI
 * actively chain them (e.g. recommend a product, then offer to book a
 * call about it) once both are on.
 */
export function AiCapabilitiesForm({
  initialRecommendProductsEnabled,
  initialAppointmentsEnabled,
  initialAppointmentSlotMinutes,
  canEdit = true,
}: {
  initialRecommendProductsEnabled: boolean;
  initialAppointmentsEnabled: boolean;
  initialAppointmentSlotMinutes: number;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateAiCapabilitiesAction, initialState);
  const [appointmentsEnabled, setAppointmentsEnabled] = useState(initialAppointmentsEnabled);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">AI capabilities</h2>
        <p className="text-sm text-ds-text-secondary">
          What your AI sales employee can do in a conversation. Turn on as many as apply — they
          work together.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm text-ds-text-primary">
          <input
            type="checkbox"
            name="recommendProductsEnabled"
            defaultChecked={initialRecommendProductsEnabled}
            disabled={isPending || !canEdit}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">Recommend products/services with images and pricing</span>
            <span className="text-xs text-ds-text-muted">
              Shows matching catalog items directly in the chat, filtered by budget when a prospect
              mentions one. An item only appears as a photo card if it has an image set on your{" "}
              <a href="/dashboard/products" className="underline hover:text-ds-text-secondary">
                Products
              </a>{" "}
              or{" "}
              <a href="/dashboard/services" className="underline hover:text-ds-text-secondary">
                Services
              </a>{" "}
              page — otherwise the AI still recommends it, just describes it in words instead.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-ds-text-primary">
          <input
            type="checkbox"
            name="appointmentsEnabled"
            checked={appointmentsEnabled}
            onChange={(event) => setAppointmentsEnabled(event.target.checked)}
            disabled={isPending || !canEdit}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">Enable appointment booking</span>
            <span className="text-xs text-ds-text-muted">
              Lets the AI offer real open times (from your{" "}
              <a href="/dashboard/business-hours" className="underline hover:text-ds-text-secondary">
                Business Hours
              </a>
              ) and request an appointment. Every request needs your confirmation on the{" "}
              <a href="/dashboard/appointments" className="underline hover:text-ds-text-secondary">
                Appointments
              </a>{" "}
              page before it&rsquo;s booked.
            </span>
          </span>
        </label>

        {appointmentsEnabled ? (
          <div className="ml-6 flex flex-col gap-1">
            <label htmlFor="appointmentSlotMinutes" className="text-sm font-medium text-ds-text-secondary">
              Slot length (minutes)
            </label>
            <input
              id="appointmentSlotMinutes"
              name="appointmentSlotMinutes"
              type="number"
              min={5}
              max={240}
              defaultValue={initialAppointmentSlotMinutes}
              disabled={isPending || !canEdit}
              className={`${inputClasses} max-w-xs`}
            />
          </div>
        ) : (
          // Keep the field present (hidden) so a save while the checkbox is
          // off still submits a valid value -- the server action validates
          // it unconditionally.
          <input type="hidden" name="appointmentSlotMinutes" value={initialAppointmentSlotMinutes} />
        )}

        <p className="text-xs text-ds-text-muted">Lead capture is always on — the AI can always collect contact details for follow-up.</p>
      </div>

      <AnimatePresence mode="wait">
        {state.error ? (
          <ErrorOrSuccess key="error" role="alert" className="text-ds-danger">
            {state.error}
          </ErrorOrSuccess>
        ) : null}
        {state.success ? (
          <ErrorOrSuccess key="success" className="text-ds-success">
            AI capabilities updated.
          </ErrorOrSuccess>
        ) : null}
      </AnimatePresence>

      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save AI capabilities"}
      </button>
    </form>
  );
}

function ErrorOrSuccess({
  role,
  className,
  children,
}: {
  role?: "alert";
  className: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.p
      role={role}
      className={`text-sm ${className}`}
      initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.p>
  );
}
