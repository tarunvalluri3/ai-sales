import type { ReactNode } from "react";
import { CheckList, Eyebrow, Reveal } from "./primitives";

/*
 * One feature, explained: label, headline, what it does, the details as a
 * checklist, and its illustration. Alternates sides down a page.
 */
export function FeatureBlock({
  id,
  icon,
  label,
  title,
  body,
  points,
  visual,
  flip = false,
  wide = false,
  extra,
}: {
  id: string;
  icon?: ReactNode;
  label: string;
  title: ReactNode;
  body: ReactNode;
  points: readonly ReactNode[];
  visual: ReactNode;
  flip?: boolean;
  /** Real-screenshot visuals: drop the inner width cap and most padding. */
  wide?: boolean;
  extra?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal className={flip ? "lg:order-2" : ""}>
          <Eyebrow>
            {icon}
            {label}
          </Eyebrow>
          <h2 id={`${id}-title`} className="site-h2 mt-5 !text-[clamp(1.6rem,1.4vw+1.1rem,2.5rem)]">
            {title}
          </h2>
          <p className="site-lead mt-5">{body}</p>
          <CheckList items={points} className="mt-7" />
          {extra}
        </Reveal>
        <Reveal delay={0.1} className={`relative ${flip ? "lg:order-1" : ""}`}>
          <div className={`relative overflow-hidden rounded-[32px] border border-ds-border bg-ds-surface-soft ${wide ? "p-3 sm:p-5" : "p-6 sm:p-10"}`}>
            <div aria-hidden="true" className="site-dots-bg absolute inset-0 opacity-70 [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]" />
            <div aria-hidden="true" className="site-glow left-1/2 top-1/2 h-[260px] w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-30" />
            <div className={`relative mx-auto flex justify-center ${wide ? "" : "max-w-[440px]"}`}>
              <div className="w-full">{visual}</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Inner-page hero. Fills the first screen under the header (so nothing below
 * peeks in), with the copy left and a visual right, or centred copy with
 * content underneath (`align="center"`, e.g. pricing cards).
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  aside,
  align = "left",
  below,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  align?: "left" | "center";
  /** Rendered under the copy inside the hero (centre layout only). */
  below?: ReactNode;
}) {
  const centered = align === "center";
  return (
    <section className="relative flex min-h-[calc(100svh-68px)] items-center overflow-hidden border-b border-ds-border px-5 py-16 sm:px-8 lg:px-12">
      <div aria-hidden="true" className="site-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[760px]" />
      <div aria-hidden="true" className={`site-glow top-[-160px] h-[380px] w-[680px] opacity-40 ${centered ? "left-1/2 -translate-x-1/2" : "left-[18%]"}`} />
      <div className={`relative mx-auto w-full max-w-[1200px] ${aside ? "grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16" : ""}`}>
        <div className={centered ? "mx-auto flex max-w-[860px] flex-col items-center text-center" : "max-w-[720px]"}>
          <p className="site-eyebrow site-rise">{eyebrow}</p>
          <h1 className="site-h1 site-rise mt-6 !text-[clamp(2.25rem,3.6vw+1rem,4rem)]" style={{ animationDelay: "0.08s" }}>
            {title}
          </h1>
          <p className={`site-lead site-rise mt-6 max-w-[660px] ${centered ? "mx-auto" : ""}`} style={{ animationDelay: "0.16s" }}>
            {lead}
          </p>
          {children ? (
            <div className="site-rise mt-9" style={{ animationDelay: "0.24s" }}>
              {children}
            </div>
          ) : null}
        </div>
        {aside ? (
          <div className="site-rise" style={{ animationDelay: "0.3s" }}>
            {aside}
          </div>
        ) : null}
        {below ? (
          <div className="site-rise mt-14 w-full" style={{ animationDelay: "0.32s" }}>
            {below}
          </div>
        ) : null}
      </div>
    </section>
  );
}
