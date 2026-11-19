"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Bell,
  CalendarCheck,
  Check,
  Clock3,
  FileText,
  Globe,
  Hand,
  Languages,
  Layers,
  Mail,
  MessageCircleQuestion,
  Phone,
  ShieldCheck,
  Sparkles,
  Tag,
  Timer,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { useInView, useSequence } from "./motion";
import { InstagramIcon, PilotTile, WebsiteIcon, WhatsAppIcon } from "./brand-icons";

/*
 * Coded product illustrations. Each mirrors a real screen or behaviour of
 * the dashboard (same labels, same rules -- e.g. bookings are "requested"
 * until the business confirms, lead scores use the real 0-9 rubric), drawn
 * as light UI so it stays razor sharp at every size.
 *
 * Every one runs only while on screen and shows its finished state under
 * prefers-reduced-motion.
 */

function useLive(durations: readonly number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView } = useInView(ref);
  const step = useSequence(durations, inView);
  return { ref, step, inView };
}

/** Light "app card" surface used inside illustrations. */
export function Pane({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/[0.07] bg-white text-left text-[#151713] shadow-[0_24px_50px_-28px_rgba(21,23,19,0.4)] ${className}`}
    >
      {children}
    </div>
  );
}

function PaneHead({ icon, title, right }: { icon: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
      <span className="text-[#61665d]">{icon}</span>
      <span className="text-[12.5px] font-medium">{title}</span>
      <span className="ml-auto">{right}</span>
    </div>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "lime" | "green" | "amber" | "ink" | "red" }) {
  const tones = {
    neutral: "bg-[#eff1ec] text-[#50554c]",
    lime: "bg-[#d6fb93] text-[#203509]",
    green: "bg-[#e3f6ec] text-[#1f7a4c]",
    amber: "bg-[#ffedc2] text-[#8a5a00]",
    ink: "bg-[#151713] text-white",
    red: "bg-[#fdebe8] text-[#b23a26]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${tones[tone]}`}>{children}</span>;
}

/* ======================================================================
 * 1. Train: knowledge sources get read and indexed.
 * ==================================================================== */
const SOURCES = [
  { icon: <Layers className="size-3.5" />, label: "Products", meta: "24 items" },
  { icon: <Tag className="size-3.5" />, label: "Services", meta: "8 items" },
  { icon: <MessageCircleQuestion className="size-3.5" />, label: "FAQs", meta: "32 answers" },
  { icon: <FileText className="size-3.5" />, label: "price-list.pdf", meta: "File upload" },
  { icon: <Globe className="size-3.5" />, label: "yourbusiness.com/about", meta: "Website import" },
];

export function TrainIllustration() {
  const { ref, step } = useLive([600, 700, 700, 700, 700, 900, 2600]);
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<BookOpen className="size-4" />} title="Knowledge base" right={<Pill tone={step >= 6 ? "lime" : "neutral"}>{step >= 6 ? "Agent ready" : "Indexing…"}</Pill>} />
        <ul className="flex flex-col gap-1.5 p-3">
          {SOURCES.map((s, i) => {
            const done = step > i;
            const active = step === i + 1 || (step === i && i === 0);
            return (
              <li key={s.label} className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-[#fbfbfa] px-3 py-2">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-[#ecffd2] transition-[width] duration-700 ease-out"
                  style={{ width: done ? "100%" : active ? "45%" : "0%" }}
                />
                <span className="relative flex items-center gap-2.5 text-[12px]">
                  <span className="flex size-6 items-center justify-center rounded-md bg-white text-[#50554c] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">{s.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                  <span className="text-[10.5px] text-[#61665d]">{s.meta}</span>
                  <span className={`flex size-4 items-center justify-center rounded-full transition-all duration-300 ${done ? "scale-100 bg-[#1f7a4c] text-white" : "scale-75 bg-black/[0.06] text-transparent"}`}>
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5 text-[11px] text-[#61665d]">
          <span>Answers only from approved sources</span>
          <ShieldCheck className="size-3.5 text-[#1f7a4c]" />
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * 2. Personalize: persona, language and widget look.
 * ==================================================================== */
const GREETINGS = [
  { lang: "English", text: "Hi! How can I help you today?" },
  { lang: "Hindi", text: "नमस्ते! मैं आपकी क्या मदद कर सकता हूँ?" },
  { lang: "Spanish", text: "¡Hola! ¿En qué puedo ayudarte hoy?" },
  { lang: "French", text: "Bonjour ! Comment puis-je vous aider ?" },
];
const TONES = ["Friendly", "Professional", "Concise"];
const SWATCHES = ["#151713", "#203509", "#1d4ed8", "#be185d"];

export function PersonalizeIllustration() {
  const { ref, step } = useLive([1800, 1800, 1800, 1800]);
  const g = GREETINGS[step % GREETINGS.length];
  const swatch = SWATCHES[step % SWATCHES.length];
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<Sparkles className="size-4" />} title="Agent personality" right={<Pill>Draft</Pill>} />
        <div className="grid gap-3 p-4">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#61665d]">Tone</p>
            <div className="mt-1.5 flex gap-1.5">
              {TONES.map((t, i) => (
                <span key={t} className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-500 ${i === step % 3 ? "border-[#203509] bg-[#203509] text-white" : "border-black/10 text-[#50554c]"}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#61665d]">Language</p>
              <p className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11.5px]">
                <Languages className="size-3.5 text-[#61665d]" /> {g.lang}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#61665d]">Brand colour</p>
              <div className="mt-1.5 flex gap-1.5">
                {SWATCHES.map((c) => (
                  <span key={c} className={`size-6 rounded-full transition-transform duration-300 ${c === swatch ? "scale-110 ring-2 ring-black/20 ring-offset-2" : ""}`} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-[#f6f7f5] p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full text-white transition-colors duration-500" style={{ background: swatch }}>
                <Sparkles className="size-3" />
              </span>
              <span className="text-[11px] font-medium">Preview</span>
            </div>
            <p key={g.lang} className="site-rise mt-2 rounded-xl rounded-bl-md border border-black/[0.06] bg-white px-3 py-2 text-[12px]">
              {g.text}
            </p>
          </div>
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * 3. Go live: channels switch on, snippet, live badge.
 * ==================================================================== */
const CHANNELS = [
  { icon: <WebsiteIcon className="size-7" />, label: "Website widget", meta: "One script tag" },
  { icon: <WhatsAppIcon className="size-7" />, label: "WhatsApp Business", meta: "Your own number" },
  { icon: <InstagramIcon className="size-7" />, label: "Instagram DMs", meta: "Professional account" },
];

export function GoLiveIllustration() {
  const { ref, step } = useLive([700, 900, 900, 900, 2800]);
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<Zap className="size-4" />} title="Channels" right={<Pill tone={step >= 4 ? "green" : "neutral"}>{step >= 4 ? <><span className="size-1.5 rounded-full bg-[#1f7a4c]" /> Live</> : "Not published"}</Pill>} />
        <ul className="flex flex-col gap-2 p-3">
          {CHANNELS.map((c, i) => {
            const on = step > i;
            return (
              <li key={c.label} className="flex items-center gap-3 rounded-xl border border-black/[0.06] px-3 py-2.5">
                {c.icon}
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[12.5px] font-medium">{c.label}</span>
                  <span className="text-[10.5px] text-[#61665d]">{c.meta}</span>
                </span>
                <span className={`relative h-5 w-9 rounded-full transition-colors duration-300 ${on ? "bg-[#203509]" : "bg-[#d3d7d1]"}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-300 ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mx-3 mb-3 overflow-hidden rounded-xl bg-[#151713] px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-[#aab1a2]">
          <span className="text-[#b2ff38]">&lt;script</span> src=&quot;…/widget-loader.js&quot;
          <br />
          &nbsp;&nbsp;data-key=&quot;wk_live_…&quot;<span className="text-[#b2ff38]">&gt;&lt;/script&gt;</span>
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * 4. Convert: leads land in the pipeline.
 * ==================================================================== */
const PIPE = [
  { name: "Ananya R.", via: <WhatsAppIcon className="size-3.5" />, q: "Hot", tone: "ink" as const },
  { name: "Rahul M.", via: <WebsiteIcon className="size-3.5" />, q: "Warm", tone: "amber" as const },
  { name: "Sneha K.", via: <InstagramIcon className="size-3.5" />, q: "Hot", tone: "ink" as const },
];

export function ConvertIllustration() {
  const { ref, step } = useLive([700, 900, 900, 900, 1100, 2600]);
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<Users className="size-4" />} title="Leads" right={<span className="text-[11px] text-[#61665d]">This week</span>} />
        <div className="flex flex-col gap-2 p-3">
          {PIPE.map((l, i) => (
            <div key={l.name} className="site-grow" data-on={step > i}>
              <div className="flex items-center gap-2.5 rounded-xl border border-black/[0.06] px-3 py-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-[#eff1ec] text-[10.5px] font-semibold">{l.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium">{l.name} {l.via}</span>
                  <span className="text-[10.5px] text-[#61665d]">{i === 0 ? "Requested Sat 10:30 AM" : i === 1 ? "Asked about pricing" : "Requested a callback"}</span>
                </span>
                <Pill tone={l.tone}>{l.q}</Pill>
              </div>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Leads", v: step >= 3 ? "3" : String(step) },
              { k: "Hot", v: step >= 3 ? "2" : step >= 1 ? "1" : "0" },
              { k: "Booked", v: step >= 4 ? "1" : "0" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl bg-[#f6f7f5] py-2">
                <p className="text-[16px] font-medium tabular-nums">{m.v}</p>
                <p className="text-[10px] uppercase tracking-[0.1em] text-[#61665d]">{m.k}</p>
              </div>
            ))}
          </div>
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Lead score: the real 0-9 rubric, point by point.
 * ==================================================================== */
const SIGNALS = [
  { label: "Appointment booked", pts: 4 },
  { label: "Requested a callback", pts: 2 },
  { label: "Gave both email and phone", pts: 1 },
];

export function LeadScoreIllustration() {
  const { ref, step } = useLive([800, 900, 900, 900, 3000]);
  const score = SIGNALS.slice(0, Math.min(step, 3)).reduce((a, s) => a + s.pts, 0);
  const q = score >= 4 ? "Hot" : score >= 2 ? "Warm" : "Cold";
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div ref={ref}>
      <Pane className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative size-[84px] shrink-0">
            <svg viewBox="0 0 84 84" className="size-full -rotate-90">
              <circle cx="42" cy="42" r={R} fill="none" stroke="#eff1ec" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r={R}
                fill="none"
                stroke={score >= 4 ? "#203509" : "#c9a15a"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - score / 9)}
                style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-[22px] font-medium tabular-nums">{score}</span>
              <span className="mt-0.5 text-[10px] text-[#61665d]">of 9</span>
            </span>
          </div>
          <div className="min-w-0">
            <Pill tone={q === "Hot" ? "ink" : q === "Warm" ? "amber" : "neutral"}>{q}</Pill>
            <p className="mt-1.5 text-[12px] leading-snug text-[#50554c]">AI-assessed. Your team can always override it.</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-1.5">
          {SIGNALS.map((s, i) => (
            <li key={s.label} className="site-grow" data-on={step > i}>
              <span className="flex items-center justify-between rounded-lg bg-[#f6f7f5] px-3 py-1.5 text-[11.5px]">
                {s.label}
                <span className="font-medium text-[#1f7a4c]">+{s.pts}</span>
              </span>
            </li>
          ))}
        </ul>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Booking: real slots from business hours; request -> confirm.
 * ==================================================================== */
const SLOTS = ["9:30", "10:30", "11:30", "2:00", "3:00", "4:00"];

export function BookingIllustration() {
  const { ref, step } = useLive([900, 900, 1200, 1300, 2600]);
  const picked = step >= 1;
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<CalendarCheck className="size-4" />} title="Appointments" right={<span className="text-[11px] text-[#61665d]">Wed, 21 Oct</span>} />
        <div className="p-4">
          <div className="grid grid-cols-3 gap-1.5">
            {SLOTS.map((s, i) => {
              const booked = i === 3;
              const sel = picked && i === 1;
              return (
                <span
                  key={s}
                  className={`rounded-lg border py-1.5 text-center text-[11.5px] transition-all duration-300 ${
                    sel ? "border-[#203509] bg-[#203509] text-white" : booked ? "border-transparent bg-[#eff1ec] text-[#9a9e96] line-through" : "border-black/10 text-[#151713]"
                  }`}
                >
                  {s}
                </span>
              );
            })}
          </div>
          <div className="mt-3 rounded-xl border border-black/[0.06] p-3">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#eff1ec] text-[10.5px] font-semibold">T</span>
              <span className="flex-1 leading-tight">
                <span className="block font-medium">Tarun · 10:30 AM</span>
                <span className="text-[10.5px] text-[#61665d]">Booked by AI in chat</span>
              </span>
              <Pill tone={step >= 3 ? "green" : step >= 2 ? "amber" : "neutral"}>{step >= 3 ? "Confirmed" : step >= 2 ? "Pending" : "—"}</Pill>
            </div>
            <div className="site-grow" data-on={step === 2}>
              <div className="mt-2.5 flex gap-1.5">
                <span className="flex-1 rounded-lg bg-[#203509] py-1.5 text-center text-[11px] font-medium text-white">Confirm</span>
                <span className="flex-1 rounded-lg border border-black/10 py-1.5 text-center text-[11px]">Decline</span>
              </div>
            </div>
            <div className="site-grow" data-on={step >= 3}>
              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#1f7a4c]">
                <Mail className="size-3" /> Prospect notified by email and WhatsApp
              </p>
            </div>
          </div>
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Handoff: AI-handled -> human-controlled -> handed back.
 * ==================================================================== */
export function HandoffIllustration() {
  const { ref, step } = useLive([1400, 1500, 1800, 1600, 1600]);
  const human = step >= 1 && step <= 3;
  return (
    <div ref={ref}>
      <Pane>
        <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-500 ${human ? "bg-[#ffedc2] text-[#8a5a00]" : "bg-[#eff1ec] text-[#50554c]"}`}>
            {human ? <Hand className="size-3.5" /> : <Sparkles className="size-3.5" />}
            {human ? "Human-controlled" : "AI-handled"}
          </span>
          <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-500 ${human ? "border border-black/10 text-[#151713]" : "bg-[#203509] text-white"}`}>
            {human ? "Hand back to AI" : "Take over"}
          </span>
        </div>
        <div className="flex flex-col gap-2 bg-[#fbfbfa] p-3">
          <p className="max-w-[80%] rounded-2xl rounded-bl-md bg-[#eff1ec] px-3 py-2 text-[11.5px]">Can I speak to someone about a bulk order?</p>
          <div className="site-grow" data-on={step >= 1}>
            <p className="mx-auto mt-0.5 w-fit rounded-full bg-[#ffedc2] px-2.5 py-0.5 text-[10px] text-[#8a5a00]">AI paused · Priya joined</p>
          </div>
          <div className="site-grow" data-on={step >= 2}>
            <p className="ml-auto mt-0.5 max-w-[80%] rounded-2xl rounded-br-md bg-[#203509] px-3 py-2 text-[11.5px] text-white">Hi! I&apos;m Priya. Happy to help with that — how many units?</p>
          </div>
          <div className="site-grow" data-on={step >= 4}>
            <p className="mx-auto mt-0.5 w-fit rounded-full bg-[#eff1ec] px-2.5 py-0.5 text-[10px] text-[#50554c]">Handed back · AI resumed</p>
          </div>
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Workflows: trigger -> wait -> actions.
 * ==================================================================== */
const NODES = [
  { k: "Trigger", t: "Lead score reaches 4+", icon: <Zap className="size-3.5" /> },
  { k: "Wait", t: "30 minutes", icon: <Timer className="size-3.5" /> },
  { k: "Action", t: "Assign to a team member", icon: <UserRound className="size-3.5" /> },
  { k: "Action", t: "Email the sales team", icon: <Mail className="size-3.5" /> },
];

export function WorkflowIllustration() {
  const { ref, step } = useLive([800, 800, 800, 800, 2400]);
  return (
    <div ref={ref}>
      <Pane className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-medium">Hot lead follow-up</p>
          <Pill tone="green">Enabled</Pill>
        </div>
        <ol className="mt-3 flex flex-col">
          {NODES.map((n, i) => (
            <li key={i} className="flex flex-col items-center">
              {i > 0 ? (
                <span className="relative h-4 w-px bg-black/15">
                  <span className={`absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-[#7fbf1f] transition-opacity duration-300 ${step === i ? "opacity-100" : "opacity-0"}`} />
                </span>
              ) : null}
              <span
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-[11.5px] transition-all duration-500 ${
                  step >= i ? "border-[#203509]/25 bg-[#f6fbef]" : "border-black/[0.07] bg-white"
                }`}
              >
                <span className={`flex size-6 items-center justify-center rounded-md transition-colors duration-500 ${step >= i ? "bg-[#203509] text-white" : "bg-[#eff1ec] text-[#61665d]"}`}>{n.icon}</span>
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#61665d]">{n.k}</span>
                <span className="font-medium">{n.t}</span>
                {step > i || step === 4 ? <Check className="ml-auto size-3.5 text-[#1f7a4c]" /> : null}
              </span>
            </li>
          ))}
        </ol>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Sales Copilot: today's priorities, one next action each.
 * ==================================================================== */
const PRIORITIES = [
  { who: "Ananya R.", why: "Appointment tomorrow 10:30", act: "Prepare with the sales brief", tone: "ink" as const, score: 7 },
  { who: "Vikram S.", why: "Asked for a person · 2h ago", act: "Reply now", tone: "red" as const, score: 5 },
  { who: "Meera P.", why: "Quiet for 3 days", act: "Send the drafted follow-up", tone: "amber" as const, score: 3 },
];

export function CopilotIllustration() {
  const { ref, step } = useLive([700, 700, 700, 900, 2600]);
  return (
    <div ref={ref}>
      <Pane>
        <PaneHead icon={<Sparkles className="size-4" />} title="Today" right={<span className="text-[11px] text-[#61665d]">3 priorities</span>} />
        <ul className="flex flex-col gap-2 p-3">
          {PRIORITIES.map((p, i) => (
            <li key={p.who} className="site-grow" data-on={step > i}>
              <div className="rounded-xl border border-black/[0.06] px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-medium">{p.who}</span>
                  <span className="text-[10.5px] text-[#61665d]">· {p.why}</span>
                  <span className="ml-auto">
                    <Pill tone={p.tone === "red" ? "red" : p.tone === "amber" ? "amber" : "ink"}>{p.score}/9</Pill>
                  </span>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#203509]">
                  <ArrowRight className="size-3" /> {p.act}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Analytics: the real funnel stages, bars grow.
 * ==================================================================== */
const FUNNEL = [
  { k: "Conversations", v: 100 },
  { k: "Leads", v: 38 },
  { k: "Qualified", v: 24 },
  { k: "Appointments", v: 15 },
  { k: "Converted", v: 9 },
];

export function AnalyticsIllustration() {
  const ref = useRef<HTMLDivElement>(null);
  const { seen } = useInView(ref);
  return (
    <div ref={ref}>
      <Pane className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-medium">Conversion funnel</p>
          <span className="rounded-md bg-[#eff1ec] px-2 py-0.5 text-[10.5px] text-[#50554c]">Last 30 days · sample</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {FUNNEL.map((f, i) => (
            <li key={f.k} className="grid grid-cols-[96px_1fr] items-center gap-3 text-[11.5px]">
              <span className="text-[#50554c]">{f.k}</span>
              <span className="relative h-5 overflow-hidden rounded-md bg-[#f6f7f5]">
                <span
                  data-on={seen}
                  className="site-hbar absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${f.v}%`, background: i === 0 ? "#d6fb93" : i === FUNNEL.length - 1 ? "#203509" : "#b2d982", "--bd": `${i * 0.12}s` } as CSSProperties}
                />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3 text-center">
          {[
            { icon: <WebsiteIcon className="size-4" />, k: "Website" },
            { icon: <WhatsAppIcon className="size-4" />, k: "WhatsApp" },
            { icon: <InstagramIcon className="size-4" />, k: "Instagram" },
          ].map((c, i) => (
            <div key={c.k} className="flex flex-col items-center gap-1.5">
              <span className="flex h-12 items-end gap-1">
                {[0.5, 0.8, 0.65].map((h, j) => (
                  <span key={j} data-on={seen} className="site-bar w-2 rounded-sm bg-[#203509]/80" style={{ height: `${h * (1 - i * 0.15) * 100}%`, "--bd": `${0.4 + i * 0.1 + j * 0.05}s` } as CSSProperties} />
                ))}
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-[#50554c]">{c.icon} {c.k}</span>
            </div>
          ))}
        </div>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Customer profile: one person across channels.
 * ==================================================================== */
export function CustomerIllustration() {
  const { ref, step } = useLive([700, 800, 800, 800, 2600]);
  const events = [
    { icon: <WebsiteIcon className="size-4" />, t: "Chatted on the website", d: "Mon" },
    { icon: <WhatsAppIcon className="size-4" />, t: "Asked about pricing on WhatsApp", d: "Tue" },
    { icon: <CalendarCheck className="size-4 text-[#1f7a4c]" />, t: "Booked a consultation", d: "Wed" },
  ];
  return (
    <div ref={ref}>
      <Pane>
        <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#d6fb93] text-[13px] font-semibold text-[#203509]">AR</span>
          <span className="flex-1 leading-tight">
            <span className="block text-[13px] font-medium">Ananya Rao</span>
            <span className="flex items-center gap-2 text-[10.5px] text-[#61665d]">
              <Phone className="size-3" /> +91 98•• •••• 21 <Mail className="ml-1 size-3" /> a•••@gmail.com
            </span>
          </span>
          <Pill tone="ink">7/9</Pill>
        </div>
        <ol className="flex flex-col gap-0 p-4">
          {events.map((e, i) => (
            <li key={e.t} className="site-grow" data-on={step > i}>
              <div className="flex gap-3 pb-3">
                <span className="flex flex-col items-center">
                  <span className="flex size-7 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">{e.icon}</span>
                  {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-black/10" /> : null}
                </span>
                <span className="pt-1 text-[11.5px] leading-tight">
                  <span className="block font-medium">{e.t}</span>
                  <span className="text-[10.5px] text-[#61665d]">{e.d}</span>
                </span>
              </div>
            </li>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="lime">#consultation</Pill>
            <Pill>#premium</Pill>
            <Pill>Segment: Ready to buy</Pill>
          </div>
        </ol>
      </Pane>
    </div>
  );
}

/* ======================================================================
 * Small bento visuals.
 * ==================================================================== */
export function InstantAnswersVisual() {
  const { ref, step } = useLive([1500, 1500]);
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <p className="w-fit max-w-[90%] rounded-2xl rounded-br-md bg-[#203509] px-3 py-2 text-[11.5px] text-white self-end">What are your opening hours?</p>
      <p className="flex w-fit max-w-[90%] items-start gap-1.5 rounded-2xl rounded-bl-md border border-black/[0.06] bg-white px-3 py-2 text-[11.5px] text-[#151713]">
        <Zap className={`mt-0.5 size-3 shrink-0 transition-colors duration-500 ${step ? "text-[#7fbf1f]" : "text-[#c9cec3]"}`} />
        Mon–Sat, 9 AM to 7 PM. Sunday by appointment.
      </p>
      <span className="text-[10.5px] text-[#61665d]">Served from Instant Answers · approved by you</span>
    </div>
  );
}

export function LanguagesVisual() {
  const { ref, step } = useLive([1400, 1400, 1400, 1400, 1400, 1400]);
  const langs = ["English", "हिन्दी", "Español", "Français", "Deutsch", "Português"];
  return (
    <div ref={ref} className="flex flex-wrap gap-1.5">
      {langs.map((l, i) => (
        <span key={l} className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors duration-500 ${i === step ? "border-[#203509] bg-[#203509] text-white" : "border-black/10 bg-white text-[#50554c]"}`}>
          {l}
        </span>
      ))}
    </div>
  );
}

export function HoursVisual() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {days.map((d, i) => (
          <span key={i} className={`flex h-8 flex-1 items-center justify-center rounded-lg text-[11px] font-medium ${i < 6 ? "bg-[#203509] text-white" : "bg-[#eff1ec] text-[#9a9e96]"}`}>
            {d}
          </span>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-[#50554c]">
        <Clock3 className="size-3.5" /> After hours: AI answers, team follows up at 9 AM
      </p>
    </div>
  );
}

export function NotifyVisual() {
  const { ref, step } = useLive([1200, 1200, 1200]);
  const items = [
    { icon: <Users className="size-3.5" />, t: "New hot lead · Ananya R." },
    { icon: <CalendarCheck className="size-3.5" />, t: "Appointment requested · Sat 10:30" },
    { icon: <Hand className="size-3.5" />, t: "A prospect asked for a person" },
  ];
  return (
    <div ref={ref} className="relative h-[92px]">
      {items.map((it, i) => (
        <div
          key={it.t}
          className="absolute inset-x-0 flex items-center gap-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-[11.5px] text-[#151713] shadow-[0_10px_24px_-14px_rgba(21,23,19,0.35)] transition-all duration-500"
          style={{
            top: `${((i - step + 3) % 3) * 14}px`,
            transform: `scale(${1 - ((i - step + 3) % 3) * 0.04})`,
            zIndex: 3 - ((i - step + 3) % 3),
            opacity: 1 - ((i - step + 3) % 3) * 0.25,
          }}
        >
          <span className="flex items-center gap-2 transition-opacity duration-300" style={{ opacity: (i - step + 3) % 3 === 0 ? 1 : 0 }}>
            <Bell className="size-3.5 text-[#61665d]" />
            <span className="text-[#61665d]">{it.icon}</span>
            {it.t}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ======================================================================
 * Channel hub: one agent, three channels, pulses travel to the centre.
 * ==================================================================== */
export function ChannelHub({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView } = useInView(ref);
  return (
    <div ref={ref} data-inview={inView} className={`relative mx-auto aspect-[4/3] w-full max-w-[460px] ${className}`}>
      <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" aria-hidden="true">
        {[
          "M70 60 C 160 60, 160 150, 200 150",
          "M70 150 L 200 150",
          "M70 240 C 160 240, 160 150, 200 150",
          "M200 150 C 240 150, 240 70, 330 70",
          "M200 150 C 240 150, 240 230, 330 230",
        ].map((d, i) => (
          <g key={d}>
            <path d={d} className="site-flow-path" pathLength={1} />
            <path d={d} className="site-flow-run" pathLength={1} style={{ "--fd": `${i * 0.55}s` } as CSSProperties} />
          </g>
        ))}
      </svg>
      {[
        { top: "20%", icon: <WebsiteIcon className="size-11" /> },
        { top: "50%", icon: <WhatsAppIcon className="size-11" /> },
        { top: "80%", icon: <InstagramIcon className="size-11" /> },
      ].map((n, i) => (
        <span key={i} className="absolute left-[17.5%] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-white p-1 shadow-[0_10px_30px_-12px_rgba(21,23,19,0.35)]" style={{ top: n.top }}>
          {n.icon}
        </span>
      ))}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-white p-1.5 shadow-[0_20px_50px_-16px_rgba(21,23,19,0.45)]">
        <PilotTile className="size-16" />
      </span>
      {[
        { top: "23.3%", label: "Leads", icon: <Users className="size-3.5" /> },
        { top: "76.6%", label: "Bookings", icon: <CalendarCheck className="size-3.5" /> },
      ].map((n) => (
        <span key={n.label} className="absolute left-[82.5%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3 py-1.5 text-[12px] font-medium text-[#151713] shadow-[0_10px_24px_-14px_rgba(21,23,19,0.35)]" style={{ top: n.top }}>
          {n.icon} {n.label}
        </span>
      ))}
    </div>
  );
}
