"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarCheck, Flame, ShieldCheck } from "lucide-react";
import { MacWindow, SCREENS } from "./mac-window";
import { useInView, useReducedMotion } from "./motion";
import { Btn } from "./primitives";
import { INSTAGRAM_SCRIPT, InstagramPhone, WHATSAPP_SCRIPT, WhatsAppPhone } from "./chat-illustrations";
import { InstagramIcon, WebsiteIcon, WhatsAppIcon } from "./brand-icons";
import { DEMO_HREF } from "./links";

/*
 * Home hero. First screen: the promise, two CTAs and the trial terms.
 * Below it, the REAL dashboard in a window that settles from a tilt as it
 * scrolls in, its stat cards lifting one by one, with live WhatsApp and
 * Instagram conversations on phones either side (wide screens).
 */

const CHIPS = [
  { icon: <Flame className="size-4 text-[#b23a26]" />, bg: "#fdebe8", text: "New lead · Hot 7/9", sub: "Asked for a callback", pos: "left-[-3%] top-[26%]", fd: "0s" },
  { icon: <CalendarCheck className="size-4 text-[#1f7a4c]" />, bg: "#e3f6ec", text: "Appointment requested", sub: "Wed · 10:30 AM", pos: "right-[-3%] top-[20%]", fd: "1.4s" },
  { icon: <ShieldCheck className="size-4 text-[#203509]" />, bg: "#ecffd2", text: "Answered from 5 approved sources", sub: "Website · just now", pos: "right-[8%] bottom-[-5%]", fd: "0.7s" },
];

export function HomeHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const { inView } = useInView(stageRef, { rootMargin: "0px" });
  const reduced = useReducedMotion();
  const [lit, setLit] = useState(-1);
  const [chips, setChips] = useState(0);

  // Window settles from a tilt to flat as the page scrolls (transform only).
  useEffect(() => {
    const el = tiltRef.current;
    const stage = stageRef.current;
    if (!el || !stage || reduced) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (window.innerWidth < 768) {
        el.style.setProperty("--tilt", "0");
        return;
      }
      const r = stage.getBoundingClientRect();
      const vh = window.innerHeight;
      // 1 when the window's top is at 92% of the viewport, 0 at 22%.
      const t = Math.min(1, Math.max(0, (r.top - vh * 0.22) / (vh * 0.7)));
      el.style.setProperty("--tilt", t.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Lift one stat card at a time while the window is on screen.
  useEffect(() => {
    if (!inView || reduced) return undefined;
    const timers = [setTimeout(() => setChips(1), 900), setTimeout(() => setChips(2), 1700), setTimeout(() => setChips(3), 2500)];
    let i = -1;
    const id = setInterval(() => {
      i = (i + 1) % SCREENS.overview.rects.length;
      setLit(i);
    }, 2600);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(id);
    };
  }, [inView, reduced]);

  const shownChips = reduced ? CHIPS.length : chips;

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden px-5 pb-24 sm:px-8 lg:px-12 lg:pb-32">
      <div aria-hidden="true" className="site-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[900px]" />
      <div aria-hidden="true" className="site-glow left-1/2 top-[-180px] h-[420px] w-[820px] -translate-x-1/2 opacity-50" />

      <div className="relative mx-auto flex max-w-[980px] flex-col items-center pt-16 text-center sm:pt-24 lg:pt-28">
        <a
          href="#channels"
          className="site-rise group inline-flex items-center gap-2.5 rounded-full border border-ds-border bg-ds-surface py-1 pl-1 pr-3.5 text-[13px] text-ds-text-secondary shadow-[0_6px_20px_-12px_rgba(21,23,19,0.3)]"
          style={{ "--d": "0.02s" } as CSSProperties}
        >
          <span className="flex -space-x-1.5">
            <WebsiteIcon className="size-6 rounded-[8px] ring-2 ring-white" />
            <WhatsAppIcon className="size-6 rounded-[8px] ring-2 ring-white" />
            <InstagramIcon className="size-6 rounded-[8px] ring-2 ring-white" />
          </span>
          Live on website, WhatsApp &amp; Instagram
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>

        <h1 id="hero-heading" className="site-h1 site-rise mt-7 max-w-[920px] text-ds-text-primary" style={{ "--d": "0.1s" } as CSSProperties}>
          The AI sales employee that knows your business.
        </h1>

        <p className="site-lead site-rise mt-6 max-w-[680px]" style={{ "--d": "0.18s" } as CSSProperties}>
          Waves AI Pilot answers every prospect in seconds using only what you approve, qualifies who&apos;s ready
          to buy, books appointments and hands off to your team the moment a human is needed.
        </p>

        <div className="site-rise mt-9 flex flex-col items-center gap-3 sm:flex-row" style={{ "--d": "0.26s" } as CSSProperties}>
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>

        <ul className="site-rise mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] text-ds-text-muted" style={{ "--d": "0.32s" } as CSSProperties}>
          {["14-day free trial", "No card required", "Cancel any time"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#7fbf1f]" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Product window + phones */}
      <div ref={stageRef} data-inview={inView} className="site-tilt-stage relative mx-auto mt-16 max-w-[1180px] sm:mt-20">
        <div className="site-rise" style={{ "--d": "0.4s" } as CSSProperties}>
          <div ref={tiltRef} className="site-tilt relative mx-auto max-w-[1040px]">
            <MacWindow
              shots={[SCREENS.overview.shot]}
              layers={{ 0: SCREENS.overview.rects }}
              lit={lit >= 0 ? [lit] : []}
              priority
              focus={{ s: 1.55, x: 52, y: 40 }}
              sizes="(max-width: 767px) 160vw, (min-width: 1100px) 1040px, 100vw"
            />
            {CHIPS.map((chip, i) => (
              <div key={chip.text} aria-hidden="true" className={`absolute hidden md:block ${chip.pos}`}>
                <div className="site-pop" data-on={shownChips > i}>
                  <div className="site-floaty site-float-chip" style={{ "--fd": chip.fd } as CSSProperties}>
                    <i style={{ background: chip.bg }}>{chip.icon}</i>
                    <span>
                      {chip.text}
                      <small>{chip.sub}</small>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phones flank the window on wide screens. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 top-[34%] hidden origin-top-left scale-[0.78] xl:block 2xl:-left-20 2xl:scale-[0.85]">
          <div className="site-floaty" style={{ "--fd": "0.4s" } as CSSProperties}>
            <WhatsAppPhone business="Smile Dental Care" script={WHATSAPP_SCRIPT} />
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-[26%] hidden origin-top-right scale-[0.78] xl:block 2xl:-right-20 2xl:scale-[0.85]">
          <div className="site-floaty" style={{ "--fd": "1.6s" } as CSSProperties}>
            <InstagramPhone handle="threadandloom.in" script={INSTAGRAM_SCRIPT} />
          </div>
        </div>

        <p className="mt-6 text-center text-[12.5px] text-ds-text-muted">
          The real Waves AI Pilot dashboard. Contact details masked; phone chats are sample conversations.
        </p>
      </div>
    </section>
  );
}
