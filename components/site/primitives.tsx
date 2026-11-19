"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useInView } from "./motion";

/* Shared building blocks for the public site. */

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { seen } = useInView(ref, { rootMargin: "0px 0px -8% 0px" });
  return (
    <Tag
      // Polymorphic tag: the ref type is the same DOM node interface for each.
      ref={ref as never}
      data-on={seen}
      className={`site-reveal ${className}`}
      style={{ "--rd": `${delay}s` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`site-eyebrow ${className}`}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  id,
  className = "",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center" | "split";
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  if (align === "split") {
    return (
      <Reveal className={`grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-16 ${className}`}>
        <div className="lg:col-span-7">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 id={id} className="site-h2 mt-5 text-ds-text-primary">
            {title}
          </h2>
        </div>
        <div className="lg:col-span-5">
          {lead ? <p className="site-lead">{lead}</p> : null}
          {children}
        </div>
      </Reveal>
    );
  }
  const centered = align === "center";
  return (
    <Reveal className={`${centered ? "mx-auto text-center" : ""} max-w-[760px] ${className}`}>
      {eyebrow ? <Eyebrow className={centered ? "justify-center" : ""}>{eyebrow}</Eyebrow> : null}
      <h2 id={id} className="site-h2 mt-5 text-ds-text-primary">
        {title}
      </h2>
      {lead ? <p className={`site-lead mt-5 ${centered ? "mx-auto max-w-[640px]" : "max-w-[620px]"}`}>{lead}</p> : null}
      {children}
    </Reveal>
  );
}

export function Btn({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  dot = true,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}) {
  const cls = `site-btn site-btn-${variant} ${size === "sm" ? "site-btn-sm" : ""} ${className}`;
  const inner = (
    <>
      {children}
      {variant === "primary" && dot ? <span aria-hidden="true" className="site-btn-dot" /> : null}
    </>
  );
  if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** Standard section padding and width. */
export function Section({
  children,
  className = "",
  id,
  labelledBy,
  dark = false,
  width = "max-w-[1200px]",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
  dark?: boolean;
  width?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32 ${dark ? "band-dark" : ""} ${className}`}
    >
      <div className={`relative mx-auto ${width}`}>{children}</div>
    </section>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ds-lime-soft text-ds-accent ${className}`}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2.5 6.3l2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function CheckList({ items, className = "" }: { items: readonly ReactNode[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-[1.55] text-ds-text-secondary">
          <Check />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
