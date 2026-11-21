import Link from "next/link";
import { CopyKeyButton } from "../widget-settings/copy-key-button";
import { AddOriginForm } from "./add-origin-form";

/** The card's honest state: the widget only answers once a key lists an allowed origin. Pure so it is unit-testable. */
export function widgetAnswersVisitors(keys: { status: string; allowed_origins: string[] }[]): boolean {
  return keys.some((key) => key.status === "active" && key.allowed_origins.length > 0);
}

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
export function LaunchCard({
  snippet,
  widgetReady,
  channels,
}: {
  snippet: string | null;
  /** True once a widget key has an allowed origin (see `widgetAnswersVisitors`). */
  widgetReady: boolean;
  /** Only channels that are connected AND allowed on the plan, e.g. ["WhatsApp"]. */
  channels: string[];
}) {
  const answeringOn = [...(widgetReady ? ["your website"] : []), ...channels];
  const channelList = answeringOn.length > 1 ? `${answeringOn.slice(0, -1).join(", ")} and ${answeringOn.at(-1)}` : (answeringOn[0] ?? "");
  return (
    <section
      aria-labelledby="launch-card-heading"
      className="flex flex-col gap-4 rounded-3xl bg-ds-lime-soft dx-card-pad"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="launch-card-heading" className="dx-title text-lg">
            {widgetReady ? "Your AI sales employee is live" : "Your agent is published, but your website widget won’t answer yet"}
          </h2>
          <p className="text-sm text-ds-text-secondary">
            {answeringOn.length > 0
              ? `It is answering prospects on ${channelList}. Here’s what to do next.`
              : "Add your website address below so the widget can answer visitors there."}
            {!widgetReady && channels.length > 0 ? " Add your website address below so the widget can answer visitors there too." : ""}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 text-xs font-medium text-ds-text-secondary hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          Dismiss
        </Link>
      </div>

      {!widgetReady ? <AddOriginForm /> : null}

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {NEXT_STEPS.map((step, index) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex h-full flex-col gap-1 rounded-2xl border border-ds-border bg-ds-surface p-4 transition-colors hover:border-ds-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              <span className="text-sm font-medium text-ds-text-primary">
                {index + 1}. {step.label}
              </span>
              <span className="text-xs text-ds-text-muted">{step.detail}</span>
            </Link>
          </li>
        ))}
      </ol>

      {snippet && widgetReady ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-ds-text-primary">Website embed code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-xl bg-ds-surface px-3 py-2.5 text-xs text-ds-text-secondary">
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
