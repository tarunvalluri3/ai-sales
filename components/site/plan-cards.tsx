"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "./primitives";

/*
 * Plan cards with a monthly / yearly switch. Receives plain, already
 * formatted data from the server page (which reads lib/plans.ts and the
 * launch switches), so no price is computed or invented here.
 */

export type PlanCardData = {
  key: string;
  name: string;
  tagline: string;
  featured: boolean;
  monthly: string;
  annual: string;
  annualPerMonth: string;
  quota: string;
  seats: string;
  channels: string;
  features: string[];
};

export function PlanCards({ plans }: { plans: PlanCardData[] }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-ds-border bg-ds-surface p-1">
          {[
            { v: false, l: "Monthly" },
            { v: true, l: "Yearly" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              role="radio"
              aria-checked={yearly === o.v}
              onClick={() => setYearly(o.v)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] transition-colors ${
                yearly === o.v ? "site-active" : "text-ds-text-secondary hover:text-ds-text-primary"
              }`}
            >
              {o.l}
              {o.v ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${yearly ? "bg-[#b2ff38] text-[#11160a]" : "bg-ds-lime-soft text-ds-accent"}`}>
                  2 months free
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const f = plan.featured;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-[28px] border p-7 lg:p-8 ${
                f ? "site-ink border-transparent shadow-[0_40px_80px_-40px_rgba(21,23,19,0.7)]" : "border-ds-border bg-ds-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[20px] font-medium">{plan.name}</h2>
                {f ? <span className="rounded-full bg-[#b2ff38] px-2.5 py-1 text-[11px] font-semibold text-[#11160a]">Most popular</span> : null}
              </div>
              <p className={`mt-2 min-h-[44px] text-[14.5px] leading-relaxed ${f ? "text-white/65" : "text-ds-text-secondary"}`}>{plan.tagline}</p>

              <div className="mt-6">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-[44px] font-normal leading-none tracking-[-0.035em] tabular-nums">{yearly ? plan.annual : plan.monthly}</span>
                  <span className={`text-[14px] ${f ? "text-white/60" : "text-ds-text-muted"}`}>{yearly ? "/ year" : "/ month"}</span>
                </p>
                <p className={`mt-2 text-[13px] ${f ? "text-white/55" : "text-ds-text-muted"}`}>
                  {yearly ? `Works out to ${plan.annualPerMonth} a month · GST included` : `GST included · or ${plan.annual} a year`}
                </p>
              </div>

              <div className={`mt-6 flex flex-col gap-1 border-y py-4 text-[14px] ${f ? "border-white/10" : "border-ds-border"}`}>
                <p className="font-medium">{plan.quota}</p>
                <p className={f ? "text-white/65" : "text-ds-text-secondary"}>{plan.seats}</p>
                <p className={f ? "text-white/65" : "text-ds-text-secondary"}>{plan.channels}</p>
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {plan.features.map((feat) => (
                  <li key={feat} className={`flex gap-3 text-[14px] leading-snug ${f ? "text-white/80" : "text-ds-text-secondary"}`}>
                    <Check className={f ? "!bg-white/10 !text-[#b2ff38]" : ""} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/sign-up"
                className={`site-btn mt-8 w-full ${f ? "bg-[#b2ff38] text-[#11160a] hover:bg-[#c3ff63]" : "site-btn-secondary"}`}
              >
                Start free trial
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
