"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AiConversionGoal } from "@/lib/supabase/types";
import { updateConversionGoalAction, type ConversionGoalActionState } from "./actions";

const initialState: ConversionGoalActionState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

/**
 * Phase B1 (STATE.md, "AI sales agent, not chatbot"): an explicit,
 * per-business setting -- never auto-inferred -- for what the AI is
 * driving toward. "Recommend products" binds the new recommend_products
 * tool (lib/rag.ts) and shows image/price cards for matches; "Generate
 * leads" keeps every business's existing default behavior unchanged.
 */
export function ConversionGoalForm({ initialGoal }: { initialGoal: AiConversionGoal }) {
  const [state, formAction, isPending] = useActionState(updateConversionGoalAction, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">AI conversion goal</h2>
        <p className="text-sm text-ds-text-secondary">
          What your AI sales employee should be driving every conversation toward.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="conversionGoal" className="text-sm font-medium text-ds-text-secondary">
          Goal
        </label>
        <select
          id="conversionGoal"
          name="conversionGoal"
          defaultValue={initialGoal}
          disabled={isPending}
          className={inputClasses}
        >
          <option value="generate_leads">Generate leads (default)</option>
          <option value="recommend_products">Recommend products/services with images and pricing</option>
        </select>
        <p className="text-xs text-ds-text-muted">
          Recommend products/services shows matching catalog items (with a photo, when set, and price) directly
          in the chat, filtered by budget when a prospect mentions one. Add images/categories/numeric prices on
          your <a href="/dashboard/products" className="underline hover:text-ds-text-secondary">Products</a> and{" "}
          <a href="/dashboard/services" className="underline hover:text-ds-text-secondary">Services</a> pages for
          this to work well.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {state.error ? (
          <ErrorOrSuccess key="error" role="alert" className="text-ds-danger">
            {state.error}
          </ErrorOrSuccess>
        ) : null}
        {state.success ? (
          <ErrorOrSuccess key="success" className="text-ds-success">
            Conversion goal updated.
          </ErrorOrSuccess>
        ) : null}
      </AnimatePresence>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save conversion goal"}
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
