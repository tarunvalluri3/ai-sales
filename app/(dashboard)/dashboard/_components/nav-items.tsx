import type { ComponentType, SVGProps } from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  Camera,
  CircleHelp,
  Clock,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Package,
  ScrollText,
  Users,
  Webhook,
  Wrench,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export type NavGroup = {
  /** Omitted for the top-level, ungrouped items (just "Overview" today). */
  label?: string;
  items: NavItem[];
};

/**
 * Grouped sidebar nav (2026-09-11 dashboard-professionalization pass) --
 * previously one flat 15-item list. Grouping alone changes nothing about
 * routing/active-state/badge logic below, which all operate per-item.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Engage",
    items: [
      { label: "Conversations", href: "/dashboard/conversations", icon: MessagesSquare },
      { label: "Leads", href: "/dashboard/leads", icon: Users },
      { label: "Appointments", href: "/dashboard/appointments", icon: CalendarCheck },
    ],
  },
  {
    label: "Channels",
    items: [
      { label: "Widget Settings", href: "/dashboard/widget-settings", icon: MessageSquareText },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle },
      { label: "Instagram", href: "/dashboard/instagram", icon: Camera },
    ],
  },
  {
    label: "Knowledge Base",
    items: [
      { label: "Products", href: "/dashboard/products", icon: Package },
      { label: "Services", href: "/dashboard/services", icon: Wrench },
      { label: "FAQs", href: "/dashboard/faqs", icon: CircleHelp },
      { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 }],
  },
  {
    label: "Settings",
    items: [
      { label: "Business Profile", href: "/dashboard/profile", icon: Building2 },
      { label: "Business Hours", href: "/dashboard/business-hours", icon: Clock },
      { label: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
      { label: "Audit Log", href: "/dashboard/audit-log", icon: ScrollText },
    ],
  },
];

/**
 * Whether `pathname` matches `href` for active-nav-item purposes: exact
 * match for `/dashboard` itself, prefix match for everything else (so
 * `/dashboard/products/[id]/edit` still highlights "Products").
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ATTENTION_BADGE_CEILING = 9;

/** Formats the attention count for the nav badge, capping at "9+". */
export function formatAttentionBadge(count: number): string {
  return count > ATTENTION_BADGE_CEILING ? `${ATTENTION_BADGE_CEILING}+` : String(count);
}
