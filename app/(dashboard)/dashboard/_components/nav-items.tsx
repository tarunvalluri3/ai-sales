import type { ComponentType, SVGProps } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  CircleHelp,
  Clock,
  CreditCard,
  House,
  Layers,
  MessageCircle,
  MessageCircleMore,
  Monitor,
  ScrollText,
  Sparkles,
  Store,
  Tag,
  UserRound,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export type NavGroup = {
  /** Omitted for the top-level, ungrouped items (just "Overview" today). */
  label?: string;
  /** Renders the group heading as a disclosure button (Knowledge Base, Settings). */
  collapsible?: boolean;
  /** Collapsible groups only: closed until opened, or until a page inside it is active. */
  defaultCollapsed?: boolean;
  items: NavItem[];
};

/**
 * Grouped sidebar nav (2026-09-11 dashboard-professionalization pass) --
 * previously one flat 15-item list. Grouping alone changes nothing about
 * routing/active-state/badge logic below, which all operate per-item.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Overview", href: "/dashboard", icon: House }],
  },
  {
    label: "Engage",
    items: [
      { label: "Conversations", href: "/dashboard/conversations", icon: MessageCircle },
      { label: "Leads", href: "/dashboard/leads", icon: Users },
      { label: "Appointments", href: "/dashboard/appointments", icon: CalendarDays },
      { label: "Customers", href: "/dashboard/customers", icon: UserRound },
    ],
  },
  {
    label: "Channels",
    items: [
      { label: "Widget Settings", href: "/dashboard/widget-settings", icon: Monitor },
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircleMore },
      { label: "Instagram", href: "/dashboard/instagram", icon: Camera },
    ],
  },
  {
    label: "Automate",
    items: [{ label: "Workflows", href: "/dashboard/workflows", icon: Workflow }],
  },
  {
    label: "Knowledge Base",
    collapsible: true,
    items: [
      { label: "Products", href: "/dashboard/products", icon: Layers },
      { label: "Services", href: "/dashboard/services", icon: Tag },
      { label: "FAQs", href: "/dashboard/faqs", icon: CircleHelp },
      { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen },
      { label: "Instant Answers", href: "/dashboard/answer-bank", icon: Zap },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { label: "Sales Copilot", href: "/dashboard/copilot", icon: Sparkles },
    ],
  },
  {
    label: "Settings",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { label: "Business Profile", href: "/dashboard/profile", icon: Store },
      { label: "Business Hours", href: "/dashboard/business-hours", icon: Clock },
      // Phase 17b. Visible to everyone, like every other item here: the
      // page itself explains that billing is admin-only, and a nav entry
      // that vanishes for some of the team answers no question. The
      // org:admin gate is on the page and on each Server Action.
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
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
