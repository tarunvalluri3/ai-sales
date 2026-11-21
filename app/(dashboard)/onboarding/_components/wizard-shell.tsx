"use client";

import { type ReactNode, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, Eye, X } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "../../_components/theme-toggle";
import { ThemedWavesLogo } from "../../_components/waves-logo";
import { useWaveClerkAppearance } from "../../_components/wave-clerk-appearance";
import { btnGhost, btnIcon, PageHeader } from "../../dashboard/_components/ui";
import { WIZARD_STAGES, type WizardStageKey } from "./wizard-config";
import { OnboardingPreviewPanel } from "./preview-panel";
import { ReadinessProgress } from "./readiness-counts";
import { useOnboardingPreview } from "./preview-context";

export type StageStatus = "done" | "current" | "upcoming";

/** Keep the sticky action row inside the visible viewport when a soft keyboard opens. */
function useKeyboardClearance(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const shell = ref.current;
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;

    function updateClearance() {
      if (!shell || !viewport) return;
      const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
      const inset = editing && viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      shell.style.setProperty("--onboarding-keyboard", inset + "px");
    }

    viewport.addEventListener("resize", updateClearance);
    viewport.addEventListener("scroll", updateClearance);
    return () => {
      viewport.removeEventListener("resize", updateClearance);
      viewport.removeEventListener("scroll", updateClearance);
    };
  }, [ref]);
}

export function WizardShell({
  activeStage,
  stageStatus,
  stageHref,
  trainingPart,
  heading,
  description,
  children,
}: {
  activeStage: WizardStageKey;
  stageStatus: Record<WizardStageKey, StageStatus>;
  stageHref: Record<WizardStageKey, string>;
  trainingPart?: 1 | 2 | 3;
  heading: string;
  description?: string;
  children: ReactNode;
}) {
  const appearance = useWaveClerkAppearance();
  const shell = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const { preview } = useOnboardingPreview();
  useKeyboardClearance(shell);

  const activeIndex = WIZARD_STAGES.findIndex((stage) => stage.key === activeStage);
  const complete = WIZARD_STAGES.filter((stage) => stageStatus[stage.key] === "done").length;
  const stagePosition = (activeIndex + 1) + " of " + WIZARD_STAGES.length;

  useEffect(() => {
    const heading = content.current?.querySelector("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [heading]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    function closeOnDesktop() {
      if (desktop.matches) dialog.current?.close();
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div ref={shell} className="onboarding-wizard">
      <header className="onboarding-header">
        <div className="onboarding-frame flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-w-0 rounded-lg" aria-label="Waves AI Pilot home">
            <ThemedWavesLogo collapseNameOnMobile />
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              ref={previewButton}
              type="button"
              aria-haspopup="dialog"
              onClick={() => dialog.current?.showModal()}
              className={btnGhost + " min-h-11 xl:hidden"}
            >
              <Eye className="size-4" aria-hidden />
              Preview
            </button>
            <ThemeToggle className="!size-11 rounded-xl" />
            <UserButton appearance={appearance} />
          </div>
        </div>
      </header>

      <div className="onboarding-frame onboarding-grid">
        <nav aria-label="Onboarding progress" className="onboarding-rail min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="text-sm font-medium text-ds-text-primary">Step {stagePosition}</p>
            <p className="text-xs text-ds-text-secondary md:hidden">{WIZARD_STAGES[activeIndex]?.label}</p>
            <p className="hidden text-xs text-ds-text-secondary md:block">{complete} complete</p>
          </div>
          <progress className="onboarding-meter mt-2" value={complete} max={WIZARD_STAGES.length}
            aria-label="Onboarding stages completed" aria-valuetext={complete + " of " + WIZARD_STAGES.length + " stages complete"} />
          <ol className="mt-5 hidden flex-col gap-1 md:flex">
            {WIZARD_STAGES.map((stage, index) => {
              const status = stageStatus[stage.key];
              const active = stage.key === activeStage;
              const style = "onboarding-stage " + (active ? "onboarding-stage-current" : "");
              const label = (
                <>
                  <span className={"onboarding-stage-marker " + (status === "done" ? "onboarding-stage-done" : "")} aria-hidden>
                    {status === "done" ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ds-text-primary">{stage.label}</span>
                    <span className="block text-xs text-ds-text-secondary">{stage.subtitle}</span>
                    {status === "done" ? <span className="sr-only">Complete</span> : null}
                  </span>
                </>
              );
              return (
                <li key={stage.key}>
                  {status !== "upcoming" && !active ? (
                    <Link href={stageHref[stage.key]} className={style}>{label}</Link>
                  ) : (
                    <div aria-current={active ? "step" : undefined} className={style}>{label}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <main ref={content} className="onboarding-content">
          <div className="flex min-w-0 flex-col gap-3">
            <PageHeader title={heading} description={description} />
            {trainingPart ? <p className="text-xs font-medium text-ds-text-secondary">Training · Part {trainingPart} of 3</p> : null}
            <ReadinessProgress counts={preview} className="xl:hidden" />
          </div>
          {children}
        </main>

        <aside aria-label="Agent preview and readiness" className="onboarding-preview hidden xl:block">
          <ReadinessProgress counts={preview} />
          <OnboardingPreviewPanel />
        </aside>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="onboarding-preview-title"
        className="onboarding-preview-sheet"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        onClose={() => previewButton.current?.focus()}
      >
        <div className="onboarding-sheet-content flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="onboarding-preview-title" className="text-base font-medium">Live preview</h2>
            <button type="button" autoFocus onClick={() => dialog.current?.close()}
              className={btnIcon + " !size-11"} aria-label="Close preview">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <OnboardingPreviewPanel showTitle={false} />
        </div>
      </dialog>
    </div>
  );
}
