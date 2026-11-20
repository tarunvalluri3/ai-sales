"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { focusFor, MacWindow, SCREENS, type Rect, type Shot } from "./mac-window";
import { useInView } from "./motion";

/*
 * "See it work": five real screens, each paired with the component inside it
 * that proves the claim.
 *
 * Desktop: the window is sticky beside a scrolling list of steps; whichever
 * step crosses the middle of the viewport becomes active, the screen
 * crossfades, then its component lifts out. A rail fills with progress.
 * Phones/tablets: one window per step, revealed as it scrolls in, zooming
 * onto the component on phones.
 */

type Step = { title: string; body: string; shot: Shot; rects: readonly Rect[]; chip: string };

const STEPS: Step[] = [
  {
    title: "Answers from your knowledge, never guesses",
    body: "Every reply is grounded in the products, services, FAQs and pages you approve. Open any answer to see the exact sources behind it. When the answer isn't there, it says so and asks a question instead of inventing one.",
    shot: SCREENS.sources.shot,
    rects: SCREENS.sources.rects,
    chip: "Grounded in 5 approved sources",
  },
  {
    title: "Qualifies every lead, and shows its reasoning",
    body: "Hot, warm or cold, with a 0–11 score built from real signals: a booked appointment, a callback request, a specific time asked for, contact details given. A signal for your team to confirm, never a verdict.",
    shot: SCREENS.leads.shot,
    rects: SCREENS.leads.rects,
    chip: "Hot · 7/11 · asked for a callback",
  },
  {
    title: "Books the meeting inside the chat",
    body: "It offers real open slots from your business hours, collects name and contact details, and sends you the request. You confirm in one click and the prospect is notified.",
    shot: SCREENS.booking.shot,
    rects: SCREENS.booking.rects,
    chip: "Wed 10:30 AM · request sent",
  },
  {
    title: "Hands off to a human in one click",
    body: "When a prospect asks for a person, raises a complaint or hits the same unknown twice, the conversation is flagged. Take over and the AI pauses until you hand it back.",
    shot: SCREENS.handoff.shot,
    rects: SCREENS.handoff.rects,
    chip: "AI paused · you're in control",
  },
  {
    title: "Website, WhatsApp and Instagram, one inbox",
    body: "Connect your own WhatsApp Business number and Instagram professional account through Meta's official platform. Every conversation lands in the same inbox, with the same rules.",
    shot: SCREENS.instagram.shot,
    rects: SCREENS.instagram.rects,
    chip: "Instagram · connected",
  },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { seen } = useInView(ref, { rootMargin: "0px 0px -22% 0px" });
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!seen) return undefined;
    const a = setTimeout(() => setStage(1), 50);
    const b = setTimeout(() => setStage(2), 900);
    const c = setTimeout(() => setStage(3), 1700);
    return () => [a, b, c].forEach(clearTimeout);
  }, [seen]);
  const focus = focusFor(step.rects);

  return (
    <li>
      <p className="font-label text-[13px] font-medium text-ds-accent">{String(index + 1).padStart(2, "0")}</p>
      <h3 className="site-h3 mt-2 text-ds-text-primary">{step.title}</h3>
      <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-ds-text-secondary">{step.body}</p>
      <div ref={ref} className="site-reveal relative mt-6" data-on={stage >= 1}>
        <MacWindow
          shots={[step.shot]}
          layers={{ 0: step.rects }}
          lit={stage >= 3 ? step.rects.map((_, j) => j) : []}
          focus={focus}
          zoomed={stage >= 2}
          sizes={`(max-width: 767px) ${Math.ceil(focus.s * 100)}vw, 100vw`}
        />
      </div>
      <div aria-hidden="true" className="mt-4">
        <div className="site-pop" data-on={stage >= 3}>
          <span className="site-chip">
            <span className="size-2 rounded-full bg-[#7fbf1f]" />
            {step.chip}
          </span>
        </div>
      </div>
    </li>
  );
}

export function ProductStory() {
  const [active, setActive] = useState(0);
  const [litFor, setLitFor] = useState(-1);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);

  // Desktop: the step whose block crosses the viewport's middle is active.
  useEffect(() => {
    const els = stepRefs.current.filter(Boolean) as HTMLLIElement[];
    if (!els.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Rail progress.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = track.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight / 2 - r.top) / r.height));
      track.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Screen first, then the component lifts.
  useEffect(() => {
    const t = setTimeout(() => setLitFor(active), 420);
    return () => clearTimeout(t);
  }, [active]);
  const lit = litFor === active ? STEPS[active].rects.map((_, j) => j) : [];

  return (
    <>
      {/* Phones and tablets */}
      <ol className="mt-14 flex flex-col gap-16 lg:hidden">
        {STEPS.map((step, i) => (
          <StepCard key={step.title} step={step} index={i} />
        ))}
      </ol>

      {/* Desktop */}
      <div className="mt-16 hidden grid-cols-[minmax(280px,360px)_1fr] gap-14 lg:grid xl:gap-20">
        <div ref={trackRef} className="relative">
          <span aria-hidden="true" className="absolute left-[3px] top-0 h-full w-px bg-ds-border">
            <span className="site-rail-fill absolute inset-0 bg-ds-text-primary" />
          </span>
          <ol>
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-index={i}
                className="relative flex min-h-[62vh] flex-col justify-center pl-10"
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1/2 size-[7px] -translate-y-1/2 rounded-full border transition-colors duration-500 ${
                    i <= active ? "border-[#7fbf1f] bg-[#7fbf1f]" : "border-ds-border-strong bg-ds-bg"
                  }`}
                />
                <p className="font-label text-[13px] font-medium text-ds-accent">{String(i + 1).padStart(2, "0")}</p>
                <h3 className={`site-h3 mt-2 transition-opacity duration-500 ${active === i ? "opacity-100" : "opacity-40"}`}>{step.title}</h3>
                <p className={`mt-3 text-[15px] leading-relaxed text-ds-text-secondary transition-opacity duration-500 ${active === i ? "opacity-100" : "opacity-40"}`}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="sticky top-[calc(50vh-min(24vw,300px))]">
            <div className="relative">
              <div aria-hidden="true" className="site-glow inset-[8%] opacity-40" />
              <div className="relative">
                <MacWindow shots={STEPS.map((s) => s.shot)} active={active} layers={Object.fromEntries(STEPS.map((s, i) => [i, s.rects]))} lit={lit} sizes="(min-width: 1440px) 900px, 62vw" />
                {STEPS.map((step, i) => (
                  <div key={step.title} aria-hidden="true" className="absolute bottom-[6%] left-[4%]">
                    <div className="site-pop" data-on={active === i && lit.length > 0}>
                      <span className="site-float-chip" style={{ "--fd": "0s" } as CSSProperties}>
                        <span className="size-2 rounded-full bg-[#7fbf1f]" />
                        {step.chip}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-5 text-[12.5px] text-ds-text-muted">Real screens from the Waves AI Pilot dashboard. Contact details masked.</p>
          </div>
        </div>
      </div>
    </>
  );
}
