"use client";

import { useActionState } from "react";
import { publishBusinessAction, type PublishBusinessState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: PublishBusinessState = {};

export function PublishButton({
  isPublished,
  hasActiveKey,
  hasPrivacyPolicyUrl,
  readinessBlocked = false,
  blockingCount = 0,
  canEdit = true,
}: {
  isPublished: boolean;
  hasActiveKey: boolean;
  hasPrivacyPolicyUrl: boolean;
  /** True when this is a first publish that the readiness gate is currently refusing. */
  readinessBlocked?: boolean;
  blockingCount?: number;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(publishBusinessAction, initialState);
  const published = isPublished || state.success === true;
  // Draft -> Publish -> Live: this button is the FIRST publish (onboarding's
  // "Publish agent"). Later publishes go through the dashboard header's
  // "Publish changes", which submits the same action. Both are readiness-gated.
  const blockedNow = !published && readinessBlocked;

  return (
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ds-text-primary">
            {published ? "Published" : "Not published yet"}
          </h2>
          <p className="max-w-xl text-sm text-ds-text-secondary">
            {published
              ? "Your widget keys will serve real chat to visitors. Later edits save as a draft and go live when you use Publish changes in the dashboard header."
              : "Prospects can't chat with this business yet -- your widget keys won't respond until you publish. Test it above first."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-ds-sm px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide-ds ${
            published ? "bg-ds-success-bg text-ds-success" : "bg-ds-warning-bg text-ds-warning"
          }`}
        >
          {published ? "Live" : "Draft"}
        </span>
      </div>

      {!hasActiveKey ? (
        <p role="status" className="rounded-ds-sm bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          You haven&rsquo;t created a widget key yet — publish is safe to click, but nothing will happen until you
          add one.
        </p>
      ) : null}

      {/* Deliberately a warning, not a block: a business can legitimately
         publish before its own policy page exists, and the widget still
         falls back to this app's /privacy. Same non-blocking shape as the
         missing-widget-key notice above. */}
      {!hasPrivacyPolicyUrl ? (
        <p role="status" className="rounded-ds-sm bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          You haven&rsquo;t set your own privacy policy URL yet (Customize &rarr; Branding &amp; language,
          below). Until you do, the consent checkbox in your widget links to Waves AI Pilot&rsquo;s privacy
          policy instead of yours. Publishing still works.
        </p>
      ) : null}

      {blockedNow ? (
        <p role="status" className="rounded-ds-sm bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          Finish the {blockingCount} required {blockingCount === 1 ? "item" : "items"} in the readiness
          checklist above before you publish. Your AI needs them to answer prospects accurately.
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

      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending || !canEdit || blockedNow}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Publishing…" : "Publish agent"}
        </button>
      </form>
    </div>
  );
}
