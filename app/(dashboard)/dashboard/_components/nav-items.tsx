import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function OverviewIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 10.5 10 4l7 6.5M5 9v6.5a.5.5 0 0 0 .5.5H8v-4h4v4h2.5a.5.5 0 0 0 .5-.5V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7v-.5A4.5 4.5 0 0 1 8.5 12h3a4.5 4.5 0 0 1 4.5 4.5v.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProductsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 6.5 10 3l7 3.5-7 3.5-7-3.5Zm0 0V13l7 3.5m0-9.5V17m0-9.5L17 6.5m0 0V13l-7 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ServicesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 3v2.2M10 14.8V17M4.2 5 5.8 6.6M14.2 13.4l1.6 1.6M3 10h2.2M14.8 10H17M4.2 15l1.6-1.6M14.2 6.6l1.6-1.6M13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FaqsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7.9 7.8a2.1 2.1 0 1 1 3.1 1.85c-.6.35-1 .7-1 1.35v.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.9" r="0.9" fill="currentColor" />
    </svg>
  );
}

function KnowledgeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 4.5A1.5 1.5 0 0 1 5.5 3H10v14H5.5A1.5 1.5 0 0 1 4 15.5v-11Zm12 0A1.5 1.5 0 0 0 14.5 3H10v14h4.5a1.5 1.5 0 0 0 1.5-1.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ConversationsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6a1.5 1.5 0 0 1-1.5 1.5H10l-3.5 3v-3H4.5A1.5 1.5 0 0 1 3 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.5 7.5h7M6.5 10h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LeadsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M13 17v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 3 15.5V17M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.5 0a2.5 2.5 0 1 0 0-5m1.5 8a2.9 2.9 0 0 1 2 2.75V17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnalyticsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3.5 16.5h13M6 16.5V10m4 6.5V6m4 10.5v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WidgetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3 3v-3H5.5A1.5 1.5 0 0 1 4 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type NavItem = {
  label: string;
  href: string;
  icon: (props: IconProps) => React.ReactElement;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: OverviewIcon },
  { label: "Business Profile", href: "/dashboard/profile", icon: ProfileIcon },
  { label: "Products", href: "/dashboard/products", icon: ProductsIcon },
  { label: "Services", href: "/dashboard/services", icon: ServicesIcon },
  { label: "FAQs", href: "/dashboard/faqs", icon: FaqsIcon },
  { label: "Knowledge", href: "/dashboard/knowledge", icon: KnowledgeIcon },
  { label: "Conversations", href: "/dashboard/conversations", icon: ConversationsIcon },
  { label: "Leads", href: "/dashboard/leads", icon: LeadsIcon },
  { label: "Analytics", href: "/dashboard/analytics", icon: AnalyticsIcon },
  { label: "Widget Settings", href: "/dashboard/widget-settings", icon: WidgetIcon },
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
