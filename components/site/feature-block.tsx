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

/** A page hero for inner pages. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pb-24">
      <div aria-hidden="true" className="site-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[700px]" />
      <div aria-hidden="true" className="site-glow left-[20%] top-[-160px] h-[360px] w-[640px] opacity-40" />
      <div className={`relative mx-auto grid max-w-[1200px] items-center gap-12 ${aside ? "lg:grid-cols-[1.1fr_1fr] lg:gap-16" : ""}`}>
        <div className={aside ? "" : "max-w-[860px]"}>
          <p className="site-eyebrow site-rise">{eyebrow}</p>
          <h1 className="site-h1 site-rise mt-6 !text-[clamp(2.25rem,3.4vw+1rem,3.75rem)]" style={{ animationDelay: "0.08s" }}>
            {title}
          </h1>
          <p className="site-lead site-rise mt-6 max-w-[640px]" style={{ animationDelay: "0.16s" }}>
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
      </div>
    </section>
  );
}
