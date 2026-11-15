import Link from "next/link";

/**
 * Shown in place of a channel's connect control when the business's plan
 * does not include that channel (Phase 17a). The page still renders -- its
 * heading, its explanation and any existing connection -- because a
 * vanishing nav item or a blank page tells a customer nothing about why,
 * and "why can't I do this" is the one question a paywall has to answer.
 *
 * Deliberately not a hard block: this notice is the *explanation*. The
 * refusal itself lives in the Server Action and the OAuth route handler,
 * so hiding a form is never what keeps a channel closed.
 */
export function ChannelUpgradeNotice({
  message,
  showPlansLink = true,
}: {
  message: string;
  showPlansLink?: boolean;
}) {
  return (
    <div className="dx-card flex flex-col items-start gap-3 px-5 py-4">
      <p className="text-sm leading-relaxed text-ds-text-secondary">{message}</p>
      {showPlansLink ? (
        <Link
          href="/pricing"
          className="ds-btn-label inline-flex h-10 items-center rounded-xl border border-ds-primary bg-ds-surface px-4 text-sm text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          See plans
        </Link>
      ) : null}
    </div>
  );
}
