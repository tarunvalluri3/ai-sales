import type { ComponentType, ReactNode } from "react";
import { Camera, Globe, MessageCircleMore, Monitor } from "lucide-react";
import { DraftNote } from "./draft-note";
import { displayContactName } from "@/lib/lead-source";

/**
 * Presentation primitives for the customer dashboard's "Wave" look
 * (globals.css, `.dash-shell`): rounded white cards on an off-white canvas,
 * deep olive actions, lime highlights. Class strings rather than wrapper
 * components for buttons, so call sites keep their own element and props
 * (same convention as `app/(dashboard)/_components/button-classes.ts`).
 * No data access and no client state: safe to import from server and client
 * components alike.
 */

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true"; strokeWidth?: number }>;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";
const BTN = `ds-btn-label inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/** Deep olive fill, white text: the one primary action in a view. */
export const btnPrimary = `${BTN} h-9 bg-ds-primary px-4 text-ds-primary-on hover:bg-ds-primary-hover`;
export const btnPrimarySm = `${BTN} h-8 bg-ds-primary px-3 text-ds-primary-on hover:bg-ds-primary-hover`;
/** Olive outline on white: the secondary action next to a primary. */
export const btnOutline = `${BTN} h-9 border border-ds-primary bg-ds-surface px-4 text-ds-primary hover:bg-ds-surface-soft`;
export const btnOutlineSm = `${BTN} h-8 border border-ds-primary bg-ds-surface px-3 text-ds-primary hover:bg-ds-surface-soft`;
/** Neutral hairline button: tertiary actions, toolbars. */
export const btnGhost = `${BTN} h-9 border border-ds-border-strong bg-ds-surface px-4 text-ds-text-primary hover:bg-ds-surface-soft`;
export const btnGhostSm = `${BTN} h-8 border border-ds-border-strong bg-ds-surface px-3 text-ds-text-primary hover:bg-ds-surface-soft`;
/** Destructive: red outline on a pale red wash. */
export const btnDanger = `${BTN} h-9 border border-ds-danger/50 bg-ds-danger-bg px-4 text-ds-danger hover:border-ds-danger`;
export const btnDangerSm = `${BTN} h-8 border border-ds-danger/50 bg-ds-danger-bg px-3 text-ds-danger hover:border-ds-danger`;
/** Text-only quiet button (Cancel, Dismiss). */
export const btnText = `${BTN} h-8 px-3 font-medium text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary`;
/** Square icon button (edit, delete, close). */
export const btnIcon = `inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-50 ${FOCUS}`;
/** Olive text link with the reference's underline-on-hover. */
export const linkAccent = `inline-flex items-center gap-1 rounded-md text-sm font-medium text-ds-primary underline-offset-4 hover:underline ${FOCUS}`;

export const inputClass = `h-10 w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3 text-sm text-ds-text-primary placeholder:text-ds-text-faint disabled:bg-ds-surface-soft disabled:text-ds-text-muted`;
export const textareaClass = `w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3 py-2 text-sm leading-relaxed text-ds-text-primary placeholder:text-ds-text-faint disabled:bg-ds-surface-soft disabled:text-ds-text-muted`;
export const labelClass = "text-sm font-medium text-ds-text-primary";
export const helpClass = "text-xs leading-relaxed text-ds-text-muted";

/**
 * Page title row: icon, title, one-line description, right-aligned actions.
 * Renders the Draft -> Publish note underneath on the editing sections (the
 * note decides for itself from the pathname, so every page can pass through
 * here without knowing whether it is a draft-backed section).
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  icon?: IconType;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** Extra content on the title line (e.g. a count pill). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? <p className="ds-section-label text-ds-text-secondary">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            {Icon ? <Icon className="size-6 shrink-0 text-ds-text-primary" strokeWidth={1.5} aria-hidden="true" /> : null}
            <h1 className="text-[28px] leading-[1.15] font-light sm:text-[32px] text-ds-text-primary">{title}</h1>
            {children}
          </div>
          {description ? <p className="max-w-[70ch] text-sm leading-normal text-ds-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <DraftNote />
    </div>
  );
}

/** White rounded surface. `as` keeps the caller's own landmark element. */
export function Card({
  children,
  className = "",
  as: Tag = "section",
  padded = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside" | "article" | "li";
  padded?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <Tag className={`dx-card ${padded ? "dx-card-pad" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Card heading with optional sub-line and right-aligned slot. */
export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  id,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconType;
  id?: string;
  /** Inline content after the title (count pill, status). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {Icon ? <Icon className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
          <h2 id={id} className="dx-title">
            {title}
          </h2>
          {children}
        </div>
        {description ? <p className="dx-subtitle">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

const BANNER_TONE = {
  lime: "bg-ds-surface-soft text-ds-text-primary",
  neutral: "bg-ds-surface-soft text-ds-text-primary",
  warning: "bg-ds-warning-bg text-ds-text-primary",
  danger: "bg-ds-danger-bg text-ds-danger",
  plain: "border border-ds-border bg-ds-surface text-ds-text-secondary",
} as const;

/** Full-width information strip (neutral by default), icon on the left. */
export function InfoBanner({
  icon: Icon,
  children,
  tone = "lime",
  className = "",
  role = "note",
}: {
  icon?: IconType;
  children: ReactNode;
  tone?: keyof typeof BANNER_TONE;
  className?: string;
  role?: "note" | "status" | "alert";
}) {
  return (
    <div role={role} className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm ${BANNER_TONE[tone]} ${className}`}>
      {Icon ? <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export type PillTone = "lime" | "solid" | "amber" | "gray" | "red" | "green" | "outline";

const PILL_TONE: Record<PillTone, string> = {
  lime: "bg-ds-primary/10 text-ds-primary",
  solid: "bg-ds-primary text-ds-primary-on",
  amber: "bg-ds-warning-bg text-ds-warning",
  gray: "bg-ds-surface-soft text-ds-text-secondary",
  red: "bg-ds-danger-bg text-ds-danger",
  green: "bg-ds-success-bg text-ds-success",
  outline: "border border-ds-border-strong bg-ds-surface text-ds-text-primary",
};

/** Rounded status / count chip. `dot` adds the small "live" dot. */
export function Pill({
  tone = "lime",
  children,
  dot = false,
  size = "md",
  className = "",
  title,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-0.5 text-2xs";
  return (
    <span
      title={title}
      className={`dx-pill inline-flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap ${sizeClass} ${PILL_TONE[tone]} ${className}`}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Neutral circle holding an icon (section markers, list bullets). */
export function IconBubble({
  icon: Icon,
  size = "md",
  className = "",
}: {
  icon: IconType;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-8";
  const glyph = size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary ${box} ${className}`}>
      <Icon className={glyph} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** Neutral numbered step bubble. */
export function StepBubble({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-xs font-medium text-ds-text-primary ${className}`}
    >
      {children}
    </span>
  );
}

/** Up to two initials from a display name, for the avatar circle. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Neutral initials circle for prospects, customers and team members. Lime is
 * reserved for "you are here" and the page's primary highlight. Placeholder
 * names ("not provided" etc.) count as no name; with no name and a `source`,
 * the channel icon is shown instead of made-up initials.
 */
export function Avatar({
  name,
  source,
  size = "md",
  className = "",
}: {
  name: string | null | undefined;
  /** Conversation / lead source: when the name is missing, its channel icon is shown. */
  source?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}) {
  const realName = displayContactName(name);
  const box =
    size === "2xl"
      ? "size-16 text-lg"
      : size === "xl"
        ? "size-14 text-base"
        : size === "lg"
        ? "size-12 text-sm"
        : size === "sm"
          ? "size-7 text-2xs"
          : "size-8 text-xs";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ds-surface-soft font-medium text-ds-text-primary ${box} ${className}`}
    >
      {realName === null && source !== undefined ? (
        <ChannelIcon source={source} className="size-[45%] shrink-0" strokeWidth={1.75} />
      ) : (
        initialsOf(realName)
      )}
    </span>
  );
}

/**
 * The glyph for a conversation / lead channel (`conversations.source`):
 * WhatsApp, Instagram, or the website widget for anything else.
 */
export function ChannelIcon({
  source,
  className = "size-5 shrink-0",
  strokeWidth = 1.75,
  website = "monitor",
}: {
  source: string | null | undefined;
  className?: string;
  strokeWidth?: number;
  website?: "monitor" | "globe";
}) {
  if (source === "whatsapp") return <MessageCircleMore className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (source === "instagram") return <Camera className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (website === "globe") return <Globe className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  return <Monitor className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** Small "(i) text" footnote row used at the bottom of cards. */
export function FootNote({ icon: Icon, children, className = "" }: { icon?: IconType; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-xs leading-relaxed text-ds-text-secondary ${className}`}>
      {Icon ? <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null}
      <span>{children}</span>
    </p>
  );
}
