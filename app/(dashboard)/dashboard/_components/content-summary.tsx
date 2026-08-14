import Link from "next/link";

export function ContentSummary({
  items,
}: {
  items: { label: string; count: number; href: string }[];
}) {
  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <h2 className="text-sm font-medium text-ds-text-primary">Knowledge base</h2>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-ds-sm px-2 py-1.5 text-sm transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              <span className="text-ds-text-secondary">{item.label}</span>
              <span className="font-medium text-ds-text-primary">{item.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
