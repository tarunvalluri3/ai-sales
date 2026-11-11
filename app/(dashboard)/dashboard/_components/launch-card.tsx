import Link from "next/link";
import { CopyKeyButton } from "../widget-settings/copy-key-button";

const NEXT_STEPS = [
  { label: "Test it on your site", detail: "Paste the snippet below, then send a message as a visitor.", href: "/dashboard/widget-settings" },
  { label: "Add more knowledge", detail: "The more it knows, the fewer questions it hands off.", href: "/dashboard/knowledge" },
  { label: "Watch conversations and leads", detail: "New chats appear here as they happen.", href: "/dashboard/conversations" },
];

/**
 * One-time "you're live" moment, shown on `/dashboard?welcome=1` right after
 * the first publish. Dismissing it is just a link back to `/dashboard`, so
 * there is no stored state to get out of sync.
 */
export function LaunchCard({ snippet }: { snippet: string | null }) {
  return (
    <section
      aria-labelledby="launch-card-heading"
      className="flex flex-col gap-4 border border-ds-success/40 bg-ds-success-bg p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="launch-card-heading" className="text-lg font-semibold text-ds-text-primary">
            Your AI sales employee is live
          </h2>
          <p className="text-sm text-ds-text-secondary">
            Prospects can chat with it now. Here&rsquo;s what to do next.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 text-xs font-medium text-ds-text-secondary hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
        >
          Dismiss
        </Link>
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {NEXT_STEPS.map((step, index) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex h-full flex-col gap-1 border border-ds-border bg-ds-surface p-3 transition-colors hover:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
            >
              <span className="text-sm font-medium text-ds-text-primary">
                {index + 1}. {step.label}
              </span>
              <span className="text-xs text-ds-text-muted">{step.detail}</span>
            </Link>
          </li>
        ))}
      </ol>

      {snippet ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-ds-text-primary">Website embed code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto bg-ds-surface px-3 py-2 text-xs text-ds-text-secondary">
              {snippet}
            </code>
            <CopyKeyButton value={snippet} />
          </div>
          <p className="text-xs text-ds-text-muted">Paste this before your site&rsquo;s closing &lt;/body&gt; tag.</p>
        </div>
      ) : null}
    </section>
  );
}
