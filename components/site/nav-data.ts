import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  Hand,
  HeartPulse,
  Inbox,
  Plane,
  Scissors,
  ShoppingBag,
  Sparkles,
  Target,
  Briefcase,
  UserRound,
  Workflow,
  MessageSquareText,
  Clock3,
  type LucideIcon,
} from "lucide-react";

/*
 * Navigation content for the public site, in one place: the header's mega
 * menus, the mobile drawer and the footer all read from here, so a new
 * feature or industry page is one entry, not three edits.
 */

export type NavEntry = { label: string; href: string; description: string; icon: LucideIcon };

export const PRODUCT_FEATURES: NavEntry[] = [
  { label: "AI Sales Agent", href: "/product#agent", description: "Answers, recommends and moves every chat forward", icon: Sparkles },
  { label: "Omnichannel Inbox", href: "/product#inbox", description: "Website, WhatsApp and Instagram in one place", icon: Inbox },
  { label: "Lead Qualification", href: "/product#leads", description: "Hot, warm or cold, with a 0–9 score and reasons", icon: Target },
  { label: "Appointment Booking", href: "/product#appointments", description: "Real slots from your hours, confirmed by you", icon: CalendarDays },
  { label: "Knowledge Base", href: "/product#knowledge", description: "Products, services, FAQs, files and web pages", icon: BookOpen },
  { label: "Human Handoff", href: "/product#handoff", description: "Take over any chat; the AI pauses for you", icon: Hand },
  { label: "Customers & Segments", href: "/product#customers", description: "One profile per customer across channels", icon: UserRound },
  { label: "Workflows", href: "/product#workflows", description: "Trigger → conditions → steps automation", icon: Workflow },
  { label: "Sales Copilot", href: "/product#copilot", description: "Today's priorities and AI sales briefs", icon: MessageSquareText },
  { label: "Analytics", href: "/product#analytics", description: "Funnel, channels and source-page conversion", icon: BarChart3 },
];

export const INDUSTRIES: NavEntry[] = [
  { label: "Real estate", href: "/solutions/real-estate", description: "Qualify buyers and book site visits", icon: Building2 },
  { label: "Clinics & healthcare", href: "/solutions/clinics", description: "Answer treatment questions, fill the calendar", icon: HeartPulse },
  { label: "Education & coaching", href: "/solutions/education", description: "Course enquiries, fees and demo classes", icon: GraduationCap },
  { label: "Salons & wellness", href: "/solutions/salons", description: "Services, prices and bookings on Instagram", icon: Scissors },
  { label: "Retail & D2C brands", href: "/solutions/retail", description: "Product recommendations in every DM", icon: ShoppingBag },
  { label: "Agencies & services", href: "/solutions/services", description: "Scope enquiries and book discovery calls", icon: Briefcase },
  { label: "Travel & hospitality", href: "/solutions/travel", description: "Packages, availability and callbacks", icon: Plane },
];

export const USE_CASES: NavEntry[] = [
  { label: "Lead generation", href: "/solutions#lead-generation", description: "Turn visitors into qualified leads", icon: Target },
  { label: "Appointment setting", href: "/solutions#appointment-setting", description: "Bookings without the back-and-forth", icon: CalendarDays },
  { label: "After-hours coverage", href: "/solutions#after-hours", description: "Answer at 11 PM like it's 11 AM", icon: Clock3 },
];

export const PRIMARY_NAV = [
  { label: "Product", href: "/product", menu: "product" as const },
  { label: "Solutions", href: "/solutions", menu: "solutions" as const },
  { label: "Integrations", href: "/integrations" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Platform overview", href: "/product" },
      { label: "AI Sales Agent", href: "/product#agent" },
      { label: "Omnichannel Inbox", href: "/product#inbox" },
      { label: "Lead Qualification", href: "/product#leads" },
      { label: "Appointment Booking", href: "/product#appointments" },
      { label: "Workflows", href: "/product#workflows" },
      { label: "Sales Copilot", href: "/product#copilot" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Real estate", href: "/solutions/real-estate" },
      { label: "Clinics & healthcare", href: "/solutions/clinics" },
      { label: "Education & coaching", href: "/solutions/education" },
      { label: "Salons & wellness", href: "/solutions/salons" },
      { label: "Retail & D2C", href: "/solutions/retail" },
      { label: "Agencies & services", href: "/solutions/services" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Integrations", href: "/integrations" },
      { label: "Security & trust", href: "/security" },
      { label: "Contact", href: "/contact" },
      { label: "Waves Web Studio", href: "https://waveswebstudio.in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cancellation & Refunds", href: "/refunds" },
      { label: "Service Delivery", href: "/shipping" },
      { label: "Data Deletion", href: "/data-deletion" },
    ],
  },
];
