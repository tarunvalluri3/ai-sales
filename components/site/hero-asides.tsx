import type { CSSProperties } from "react";
import { BadgeCheck, MapPin } from "lucide-react";
import { PilotTile } from "./brand-icons";
import { INDUSTRIES } from "./nav-data";

/* Visuals for inner-page heroes that don't have a product illustration. */

/** Solutions: the industries, as floating tiles around the product mark. */
export function IndustryCloud() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <div aria-hidden="true" className="absolute inset-[12%] rounded-full border border-dashed border-ds-border-strong" />
      <div aria-hidden="true" className="absolute inset-[32%] rounded-full border border-ds-border" />
      <div aria-hidden="true" className="site-glow inset-[30%] opacity-40" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-ds-surface p-1.5 shadow-[0_20px_50px_-16px_rgba(21,23,19,0.45)]">
        <PilotTile className="size-[72px]" />
      </span>
      {INDUSTRIES.map((ind, i) => {
        const a = -90 + (360 / INDUSTRIES.length) * i;
        const x = 50 + 38 * Math.cos((a * Math.PI) / 180);
        const y = 50 + 38 * Math.sin((a * Math.PI) / 180);
        return (
          <span key={ind.href} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="site-floaty flex items-center gap-2 whitespace-nowrap rounded-full border border-ds-border bg-ds-surface py-1.5 pl-1.5 pr-3 text-[12.5px] font-medium text-ds-text-primary shadow-[0_12px_28px_-18px_rgba(21,23,19,0.45)]" style={{ "--fd": `${i * 0.5}s` } as CSSProperties}>
              <span className="flex size-6 items-center justify-center rounded-full bg-ds-lime-soft text-ds-accent">
                <ind.icon className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
              </span>
              {ind.label.replace(" & healthcare", "").replace(" & coaching", "").replace(" & D2C brands", "").replace(" & services", "").replace(" & hospitality", "").replace(" & wellness", "")}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** About: the company, as a registration card. */
export function CompanyCard() {
  const rows = [
    ["Company", "Waves Web Studio"],
    ["Product", "Waves AI Pilot"],
    ["Founded", "June 2026"],
    ["Registration", "MSME (Udyam)"],
    ["GSTIN", "36BYQPT2686E1ZR"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div aria-hidden="true" className="site-glow inset-[10%] opacity-30" />
      <div className="site-floaty relative overflow-hidden rounded-[28px] border border-ds-border bg-ds-surface p-7 shadow-[0_40px_80px_-40px_rgba(21,23,19,0.5)]">
        <div className="flex items-center gap-4">
          <PilotTile className="size-14" />
          <div>
            <p className="text-[18px] font-medium text-ds-text-primary">Waves AI Pilot</p>
            <p className="flex items-center gap-1.5 text-[13px] text-ds-text-muted">
              <MapPin className="size-3.5" aria-hidden="true" /> Hyderabad, India
            </p>
          </div>
          <BadgeCheck className="ml-auto size-6 text-ds-accent" aria-hidden="true" />
        </div>
        <dl className="mt-7 divide-y divide-ds-border border-y border-ds-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-3">
              <dt className="font-label text-[10.5px] font-medium uppercase tracking-[0.18em] text-ds-text-muted">{k}</dt>
              <dd className="text-right text-[14px] text-ds-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[13px] leading-relaxed text-ds-text-secondary">
          Independent and bootstrapped. Built and run by its founder.
        </p>
      </div>
    </div>
  );
}
