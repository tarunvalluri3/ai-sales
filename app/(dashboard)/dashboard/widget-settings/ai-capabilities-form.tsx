"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CalendarCheck, CalendarDays, Monitor, Search, ShoppingBag, UserRound } from "lucide-react";
import { updateAiCapabilitiesAction, type AiCapabilitiesActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { Card, IconBubble, Pill, StepBubble, btnPrimary, helpClass, labelClass, linkAccent } from "../_components/ui";
import { inputClasses } from "./input-classes";

const initialState: AiCapabilitiesActionState = {};

const WORKFLOW_STEPS = [
  { icon: Search, label: "Discover what the prospect needs" },
  { icon: ShoppingBag, label: "Recommend a relevant product or service" },
  { icon: CalendarDays, label: "Offer an available appointment time" },
];

/**
 * The AI capabilities tab: independent capability toggles rather than one
 * exclusive "conversion goal" (Phase B1) -- request_callback (lead capture)
 * was never actually gated by that old dropdown, so framing recommend_products
 * vs. appointments as one exclusive goal was never accurate. Both toggles
 * combine: lib/rag.ts's formatCapabilityChainingInstruction makes the AI
 * chain them (recommend a product, then offer to book a call about it) once
 * both are on. The right-hand column is explanatory only.
 */
export function AiCapabilitiesForm({
  initialRecommendProductsEnabled,
  initialAppointmentsEnabled,
  initialAppointmentSlotMinutes,
  isPublished,
  activeKeyCount,
  canEdit = true,
}: {
  initialRecommendProductsEnabled: boolean;
  initialAppointmentsEnabled: boolean;
  initialAppointmentSlotMinutes: number;
  isPublished: boolean;
  activeKeyCount: number;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateAiCapabilitiesAction, initialState);
  const [appointmentsEnabled, setAppointmentsEnabled] = useState(initialAppointmentsEnabled);
  const disabled = isPending || !canEdit;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card as="div" padded={false}>
        <form action={formAction} className="flex flex-col gap-5 dx-card-pad">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title text-lg">AI capabilities</h2>
            <p className="dx-subtitle text-base">Turn on as many as apply — they work together.</p>
          </div>

          <div className="flex items-start gap-4">
            <IconBubble icon={ShoppingBag} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="recommendProductsEnabled" className="cursor-pointer text-base font-medium text-ds-text-primary">
                Recommend products and services
              </label>
              <p className="text-sm text-ds-text-primary">
                Suggest matching catalog items with pricing, filtered by the prospect&rsquo;s budget.
              </p>
              <p className="text-sm text-ds-text-secondary">
                Photo cards appear only for items with an image; otherwise the AI describes the item in words.
              </p>
              <p className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
                <Link href="/dashboard/products" className={linkAccent}>
                  Manage products
                  <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                </Link>
                <Link href="/dashboard/services" className={linkAccent}>
                  Manage services
                  <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                </Link>
              </p>
            </div>
            <span className="relative inline-flex shrink-0 pt-1">
              <input
                id="recommendProductsEnabled"
                type="checkbox"
                name="recommendProductsEnabled"
                defaultChecked={initialRecommendProductsEnabled}
                disabled={disabled}
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span aria-hidden="true" className="dx-switch" />
            </span>
          </div>

          <div className="flex items-start gap-4 border-t border-ds-border pt-5">
            <IconBubble icon={CalendarDays} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="appointmentsEnabled" className="cursor-pointer text-base font-medium text-ds-text-primary">
                Enable appointment booking
              </label>
              <p className="text-sm text-ds-text-primary">Offer real open times based on your Business Hours.</p>

              {appointmentsEnabled ? (
                <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-ds-surface-soft p-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="appointmentSlotMinutes" className={labelClass}>
                      Slot length (minutes)
                    </label>
                    <div className="flex flex-wrap items-center gap-4">
                      <input
                        id="appointmentSlotMinutes"
                        name="appointmentSlotMinutes"
                        type="number"
                        min={5}
                        max={240}
                        defaultValue={initialAppointmentSlotMinutes}
                        disabled={disabled}
                        className={`${inputClasses} w-40 text-base`}
                      />
                      <span className={helpClass}>Choose a value from 5 to 240 minutes.</span>
                    </div>
                  </div>
                  <p className="flex items-center gap-3 rounded-xl bg-ds-warning-bg px-4 py-2.5 text-sm text-ds-text-primary">
                    <CalendarCheck className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    Every booking request needs your team&rsquo;s confirmation.
                  </p>
                </div>
              ) : (
                // Keep the field present (hidden) so a save while the toggle is
                // off still submits a valid value -- the server action validates
                // it unconditionally.
                <input type="hidden" name="appointmentSlotMinutes" value={initialAppointmentSlotMinutes} />
              )}

              <p className="flex flex-wrap gap-x-5 gap-y-1 pt-2">
                <Link href="/dashboard/business-hours" className={linkAccent}>
                  Manage Business Hours
                  <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                </Link>
                <Link href="/dashboard/appointments" className={linkAccent}>
                  Review appointments
                  <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                </Link>
              </p>
            </div>
            <span className="relative inline-flex shrink-0 pt-1">
              <input
                id="appointmentsEnabled"
                type="checkbox"
                name="appointmentsEnabled"
                checked={appointmentsEnabled}
                onChange={(event) => setAppointmentsEnabled(event.target.checked)}
                disabled={disabled}
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span aria-hidden="true" className="dx-switch" />
            </span>
          </div>

          <AnimatePresence mode="wait">
            {state.error ? (
              <ErrorOrSuccess key="error" role="alert" className="bg-ds-danger-bg text-ds-danger">
                {state.error}
              </ErrorOrSuccess>
            ) : null}
            {state.success ? (
              <ErrorOrSuccess key="success" role="status" className="bg-ds-success-bg text-ds-success">
                AI capabilities updated.
              </ErrorOrSuccess>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-4 border-t border-ds-border pt-5">
            <button type="submit" disabled={disabled} title={canEdit ? undefined : ROLE_DENIED_TITLE} className={`${btnPrimary} min-w-56`}>
              {isPending ? "Saving…" : "Save AI capabilities"}
            </button>
            <span className="text-sm text-ds-text-secondary">Saves as a draft</span>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex items-start gap-4">
          <IconBubble icon={UserRound} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="dx-title">Lead capture</h2>
              <Pill tone="lime">Always on</Pill>
            </div>
            <p className="text-sm text-ds-text-primary">
              Your AI can always collect a prospect&rsquo;s contact details and interest for follow-up.
            </p>
            <p className="text-sm text-ds-text-secondary">Lead capture cannot be switched off.</p>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="dx-title">How these work together</h2>
          <ol className="dx-rows flex flex-col">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.label} className="flex items-center gap-4 py-3">
                <StepBubble>{index + 1}</StepBubble>
                <step.icon className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-sm text-ds-text-primary">{step.label}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-ds-text-secondary">Your AI uses only your business&rsquo;s approved information.</p>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="dx-title flex items-center gap-3">
              <Monitor className="size-5" strokeWidth={1.75} aria-hidden="true" />
              Widget status
            </h2>
            <Pill tone={isPublished ? "lime" : "gray"} dot className="h-9 px-4 text-sm font-medium">
              {isPublished ? "Live" : "Draft"}
            </Pill>
          </div>
          <p className="text-sm text-ds-text-primary">
            {activeKeyCount} active widget {activeKeyCount === 1 ? "key" : "keys"}
          </p>
          <p className="text-sm text-ds-text-secondary">
            Saved changes take effect when you publish from the dashboard header.
          </p>
        </Card>
      </div>
    </div>
  );
}

function ErrorOrSuccess({
  role,
  className,
  children,
}: {
  role?: "alert" | "status";
  className: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.p
      role={role}
      className={`rounded-xl px-3 py-2 text-sm ${className}`}
      initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.p>
  );
}
