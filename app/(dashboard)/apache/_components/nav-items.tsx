import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Stop this item ships in (Phase 33, docs/phases.md) -- shown as a "Coming in Stop N" placeholder until then. Stop 1 items are real pages. */
  stop: 1 | 2 | 3 | 4 | 5;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

/**
 * The full Phase 33 sidebar shape, defined up front (per the approved
 * brief's layout requirement) even though most pages don't exist yet --
 * app/apache/_components/stop-placeholder.tsx renders a page's real
 * content once its `stop` is reached, a placeholder until then. Mirrors
 * app/(dashboard)/dashboard/_components/nav-items.tsx's grouped shape.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Overview", href: "/apache", icon: LayoutDashboard, stop: 1 }],
  },
  {
    label: "Tenants",
    items: [
      { label: "Tenants", href: "/apache/tenants", icon: Building2, stop: 2 },
      { label: "Users", href: "/apache/users", icon: Users, stop: 2 },
      { label: "Subscriptions & Billing", href: "/apache/billing", icon: CreditCard, stop: 2 },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/apache/analytics", icon: BarChart3, stop: 3 },
      { label: "AI Usage & Costs", href: "/apache/ai-usage", icon: Sparkles, stop: 3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Conversations & Leads", href: "/apache/conversations", icon: MessagesSquare, stop: 4 },
      { label: "Integrations Health", href: "/apache/integrations", icon: Activity, stop: 4 },
      { label: "Jobs & System Health", href: "/apache/jobs", icon: Wrench, stop: 4 },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Support Tools", href: "/apache/support", icon: Bell, stop: 5 },
      { label: "Feature Flags", href: "/apache/feature-flags", icon: Flag, stop: 5 },
      { label: "Audit Log", href: "/apache/audit-log", icon: ScrollText, stop: 5 },
      { label: "Settings", href: "/apache/settings", icon: Settings, stop: 5 },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/apache") {
    return pathname === "/apache";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
