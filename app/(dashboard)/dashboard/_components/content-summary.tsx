import type { ComponentType } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "./ui";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true"; strokeWidth?: number }>;

export function ContentSummary({
  items,
}: {
  items: { label: string; count: number; href: string; icon?: IconType }[];
}) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="dx-title">Knowledge base</h2>
      <ul className="dx-rows flex flex-1 flex-col">
        {items.map((item) => (
          <li key={item.href} className="flex flex-1">
            <Link
              href={item.href}
              className="flex min-h-10 flex-1 items-center gap-4 rounded-lg px-2 py-2 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              {item.icon ? <item.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null}
              <span className="flex-1">{item.label}</span>
              <span className="font-medium tabular-nums">{item.count}</span>
              <ChevronRight strokeWidth={1.75} className="size-4 shrink-0 text-ds-text-secondary" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
