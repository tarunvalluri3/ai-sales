import Link from "next/link";

const ACTIONS = [
  { label: "Add product", href: "/dashboard/products" },
  { label: "Add service", href: "/dashboard/services" },
  { label: "Add FAQ", href: "/dashboard/faqs" },
  { label: "Add knowledge", href: "/dashboard/knowledge" },
  { label: "Review leads", href: "/dashboard/leads" },
  { label: "Widget settings", href: "/dashboard/widget-settings" },
];

export function QuickActions() {
  return (
    <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <h2 className="text-sm font-medium text-ds-text-primary">Quick actions</h2>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-full border border-ds-border-strong px-3.5 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-accent-muted hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
