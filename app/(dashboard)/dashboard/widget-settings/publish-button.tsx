"use client";

import { useActionState, useEffect, useId, type ReactNode } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { publishBusinessAction, type PublishBusinessState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { Card, btnPrimary } from "../_components/ui";

const initialState: PublishBusinessState = {};

/** How long the "Your agent is live" confirmation stays up before the redirect. */
export const LIVE_CONFIRMATION_MS = 2500;

export function PublishButton({
  isPublished,
  hasActiveKey,
  hasPrivacyPolicyUrl,
  privacyPolicyFieldHref,
  readinessBlocked = false,
  blockingCount = 0,
  canEdit = true,
  redirectOnSuccess,
  backAction,
  footerClassName = "",
}: {
  isPublished: boolean;
  hasActiveKey: boolean;
  hasPrivacyPolicyUrl: boolean;
  privacyPolicyFieldHref?: string;
  /** True when this is a first publish that the readiness gate is currently refusing. */
  readinessBlocked?: boolean;
  blockingCount?: number;
  canEdit?: boolean;
  /** Where to send the owner once a publish succeeds (onboarding: the dashboard welcome). */
  redirectOnSuccess?: string;
  backAction?: ReactNode;
  footerClassName?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(publishBusinessAction, initialState);
  const published = isPublished || state.success === true;

  const confirming = state.success === true && Boolean(redirectOnSuccess);

  // Confirm first, then move on: the owner sees "Your agent is live" before
  // the redirect, not a page that silently swaps under them.
  useEffect(() => {
    if (!confirming || !redirectOnSuccess) return;
    const timeoutId = setTimeout(() => router.replace(redirectOnSuccess), LIVE_CONFIRMATION_MS);
    return () => clearTimeout(timeoutId);
  }, [confirming, redirectOnSuccess, router]);
  // Draft -> Publish -> Live: this button is the FIRST publish (onboarding's
  // "Publish agent"). Later publishes go through the dashboard header's
  // "Publish changes", which submits the same action. Both are readiness-gated.
  const blockedNow = !published && readinessBlocked;
  const reasonId = useId();

  return (
    <>
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium text-ds-text-primary">
            {published ? "Published" : "Not published yet"}
          </h2>
          <p className="max-w-xl text-sm text-ds-text-secondary">
            {published
              ? "Your widget keys will serve real chat to visitors. Later edits save as a draft and go live when you use Publish changes in the dashboard header."
              : "Prospects can't chat with this business yet — your widget keys won't respond until you publish. Test it above first."}
          </p>
        </div>
        <span
          className={`dx-pill shrink-0 px-2.5 py-1 text-xs font-medium ${
            published ? "bg-ds-success-bg text-ds-success" : "bg-ds-warning-bg text-ds-warning"
          }`}
        >
          {published ? "Live" : "Draft"}
        </span>
      </div>

      {!hasActiveKey ? (
        <p role="status" className="bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          You haven&rsquo;t created a widget key yet — publish is safe to click, but nothing will happen until you
          add one.
        </p>
      ) : null}

      {/* Deliberately a warning, not a block: a business can legitimately
         publish before its own policy page exists, and the widget still
         falls back to this app's /privacy. Same non-blocking shape as the
         missing-widget-key notice above. */}
      {!hasPrivacyPolicyUrl ? (
        <p role="status" className="bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          {privacyPolicyFieldHref ? (
            <a href={privacyPolicyFieldHref} className="underline underline-offset-2">Add your privacy policy URL</a>
          ) : (
            <>You haven&rsquo;t set your own privacy policy URL yet (Customize &rarr; Branding &amp; language, below)</>
          )}. Until you do, the consent checkbox in your widget links to Waves AI Pilot&rsquo;s privacy
          policy instead of yours. Publishing still works.
        </p>
      ) : null}

      {blockedNow ? (
        <p id={reasonId} role="status" className="bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          Finish the {blockingCount} required {blockingCount === 1 ? "item" : "items"} in the readiness
          checklist above before you publish. Your AI needs them to answer prospects accurately.
        </p>
      ) : null}

      {confirming ? (
        <p role="status" className="flex items-center gap-2 bg-ds-success-bg px-3 py-2 text-sm font-medium text-ds-success">
          <CircleCheck className="onboarding-published-mark size-5 shrink-0" aria-hidden />
          Your agent is live. Taking you to your dashboard…
        </p>
      ) : null}

      {state.error ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-ds-danger">
          <p>{state.error}</p>
          {state.blockingItems && state.blockingItems.length > 0 ? (
            <ul className="list-disc pl-5 text-xs">
              {state.blockingItems.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

    </Card>
    <div className={footerClassName}>
      {backAction}
      {blockedNow ? <p className="onboarding-action-reason text-xs text-ds-text-secondary">Complete the required checklist to publish.</p> : null}
      <form action={formAction} className="ml-auto min-w-0">
        <button
          type="submit"
          disabled={isPending || !canEdit || blockedNow || confirming}
          aria-describedby={blockedNow ? reasonId : undefined}
          aria-busy={isPending}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className={btnPrimary}
        >
          {isPending ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden /> : null}
          {isPending ? "Publishing…" : confirming ? "Taking you to your dashboard…" : "Publish agent"}
        </button>
      </form>
    </div>
    </>
  );
}
