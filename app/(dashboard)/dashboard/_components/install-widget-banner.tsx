import Link from "next/link";

/**
 * Shown on the dashboard overview while the agent is live but no active
 * widget key has served a chat yet (`last_used_at` is set only after a
 * request passes every widget check -- lib/widget-auth.ts). A prompt, never a
 * gate: the dashboard stays fully usable. Disappears on its own after the
 * first successful widget chat.
 */
export function InstallWidgetBanner({ hasActiveKey }: { hasActiveKey: boolean }) {
  return (
    <section
      aria-labelledby="install-widget-banner-heading"
      className="dx-card flex flex-wrap items-center justify-between gap-3 px-5 py-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="install-widget-banner-heading" className="text-sm font-medium text-ds-text-primary">
          Your widget hasn&rsquo;t answered a visitor yet
        </h2>
        <p className="text-sm text-ds-text-secondary">
          {hasActiveKey
            ? "Add the embed snippet to your site and list its exact address under Allowed origins, then send a test message."
            : "Create a widget key, add your site under Allowed origins, and paste the snippet into your site."}
        </p>
      </div>
      <Link
        href="/dashboard/widget-settings"
        className="ds-btn-label inline-flex h-9 shrink-0 items-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        Install your widget
      </Link>
    </section>
  );
}
