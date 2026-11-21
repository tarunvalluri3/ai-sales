import Link from "next/link";
import { BookOpen, Box, CircleHelp, FlaskConical, SlidersHorizontal, Tag, Users } from "lucide-react";
import { Card } from "./ui";

const ACTIONS = [
  { label: "Test your agent", href: "/dashboard/test-agent", icon: FlaskConical },
  { label: "Add product", href: "/dashboard/products", icon: Box },
  { label: "Add service", href: "/dashboard/services", icon: Tag },
  { label: "Add FAQ", href: "/dashboard/faqs", icon: CircleHelp },
  { label: "Add knowledge", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Review leads", href: "/dashboard/leads", icon: Users },
  { label: "Widget settings", href: "/dashboard/widget-settings", icon: SlidersHorizontal },
];

export function QuickActions() {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="dx-title">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border border-ds-border px-2 py-3 text-center text-sm font-medium text-ds-text-primary transition-colors hover:border-ds-primary hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            <action.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
