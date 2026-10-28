"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { Check, PanelRightClose, PanelRightOpen } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";
import { WavesLogo } from "../../_components/waves-logo";
import { WIZARD_STAGES, type WizardStageKey } from "./wizard-config";
import { OnboardingPreviewPanel } from "./preview-panel";

export type StageStatus = "done" | "current" | "upcoming";

/**
 * The one `/onboarding` shell every step renders inside (2026-10-29
 * redesign, STATE.md). Owns the top bar, the left progress rail (a
 * collapsed top bar + stage name on mobile), the centered step column,
 * and the collapsible live-preview panel on the right. Each step passes
 * its own eyebrow/heading/description/footer; this only lays them out.
 */
export function WizardShell({
  activeStage,
  stageStatus,
  stageHref,
  eyebrow,
  heading,
  description,
  footer,
  children,
}: {
  activeStage: WizardStageKey;
  stageStatus: Record<WizardStageKey, StageStatus>;
  /** Where clicking a completed stage on the rail navigates to. */
  stageHref: Record<WizardStageKey, string>;
  eyebrow: string;
  heading: string;
  description?: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const activeIndex = WIZARD_STAGES.findIndex((s) => s.key === activeStage);

  return (
    <div className="flex min-h-screen flex-col bg-ds-bg">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-ds-border bg-ds-bg px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center">
          <WavesLogo collapseNameOnMobile />
        </Link>
        <span
          role="status"
          className="hidden items-center gap-1.5 rounded-ds-sm bg-ds-surface px-2.5 py-1 text-xs text-ds-text-muted sm:flex"
        >
          <Check aria-hidden className="size-3.5 text-ds-success" />
          All changes saved
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            aria-expanded={previewOpen}
            className="flex items-center gap-1.5 rounded-ds-sm border border-ds-border px-3 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary lg:hidden"
          >
            {previewOpen ? <PanelRightClose className="size-3.5" aria-hidden /> : <PanelRightOpen className="size-3.5" aria-hidden />}
            Preview
          </button>
          <UserButton appearance={clerkDarkCompactAppearance} />
        </div>
      </header>

      {/* Mobile: a slim progress bar + current stage name replaces the rail. */}
      <div className="flex flex-col gap-1 border-b border-ds-border px-4 py-3 md:hidden">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ds-surface-elevated">
          <div
            className="h-full rounded-full bg-ds-accent transition-all"
            style={{ width: `${((activeIndex + 1) / WIZARD_STAGES.length) * 100}%` }}
          />
        </div>
        <p className="text-xs font-medium text-ds-text-secondary">
          Step {activeIndex + 1} of {WIZARD_STAGES.length} &middot;{" "}
          {WIZARD_STAGES[activeIndex]?.label ?? ""}
        </p>
      </div>

      <div className="flex flex-1 items-start">
        <nav
          aria-label="Onboarding progress"
          className="sticky top-[57px] hidden w-64 shrink-0 flex-col gap-1 self-start px-4 py-8 md:flex"
        >
          {WIZARD_STAGES.map((stage, index) => {
            const status = stageStatus[stage.key];
            const clickable = status !== "upcoming" && stage.key !== activeStage;
            const content = (
              <>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold ${
                    status === "done"
                      ? "bg-ds-success-bg text-ds-success"
                      : status === "current"
                        ? "bg-ds-accent text-ds-accent-on"
                        : "bg-ds-surface-elevated text-ds-text-muted"
                  }`}
                >
                  {status === "done" ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-medium ${
                      status === "upcoming" ? "text-ds-text-muted" : "text-ds-text-primary"
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="text-xs text-ds-text-muted">{stage.subtitle}</span>
                </span>
              </>
            );

            return clickable ? (
              <Link
                key={stage.key}
                href={stageHref[stage.key]}
                className="flex items-start gap-3 rounded-ds-sm px-2 py-2.5 transition-colors hover:bg-ds-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {content}
              </Link>
            ) : (
              <div
                key={stage.key}
                aria-current={stage.key === activeStage ? "step" : undefined}
                className={`flex items-start gap-3 rounded-ds-sm px-2 py-2.5 ${
                  stage.key === activeStage ? "bg-ds-surface" : ""
                }`}
              >
                {content}
              </div>
            );
          })}
        </nav>

        <main className="flex min-h-[calc(100vh-57px)] flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={eyebrow}
                initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-1 flex-col gap-6"
              >
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide-ds text-ds-accent-muted">
                    {eyebrow}
                  </p>
                  <h1 className="text-2xl font-semibold text-ds-text-primary">{heading}</h1>
                  {description ? (
                    <p className="max-w-lg text-sm text-ds-text-secondary">{description}</p>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-6 pb-24">{children}</div>
              </motion.div>
            </AnimatePresence>
          </div>

          {footer ? (
            <div className="sticky bottom-0 border-t border-ds-border bg-ds-bg px-4 py-4 md:px-8">
              <div className="mx-auto w-full max-w-xl">{footer}</div>
            </div>
          ) : null}
        </main>

        <aside className="sticky top-[57px] hidden w-80 shrink-0 self-start px-4 py-8 pr-6 lg:block">
          <OnboardingPreviewPanel />
        </aside>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden" role="dialog" aria-modal="true">
          <div className="flex h-full w-full max-w-sm flex-col gap-4 bg-ds-bg p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ds-text-primary">Live preview</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-ds-sm px-2 py-1 text-sm text-ds-text-secondary hover:text-ds-text-primary"
              >
                Close
              </button>
            </div>
            <OnboardingPreviewPanel />
          </div>
        </div>
      ) : null}
    </div>
  );
}
