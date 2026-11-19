"use client";

import { useRef, type ReactNode } from "react";
import { CalendarCheck, ChevronLeft, Phone, Send, Sparkles, Video } from "lucide-react";
import { useInView, useSequence } from "./motion";
import { InstagramIcon, WhatsAppIcon } from "./brand-icons";

/*
 * Animated conversations on the channels the product actually serves:
 * WhatsApp and Instagram (on a phone, from the customer's side) and the
 * website widget. Every script is a SAMPLE conversation -- illustrative
 * businesses, never presented as real customers.
 *
 * A script is a list of lines; each line appears after the previous one,
 * with a typing indicator before every AI line. The loop pauses off-screen
 * and holds the finished conversation under reduced motion.
 */

export type ChatLine =
  | { from: "customer"; text: string }
  | { from: "ai"; text: string; card?: ReactNode };

/** Durations: [typing, line] per AI line, [line] per customer line, then a hold. */
function timeline(script: readonly ChatLine[]) {
  const steps: { show: number; typing: boolean; ms: number }[] = [{ show: 0, typing: false, ms: 700 }];
  script.forEach((line, i) => {
    if (line.from === "ai") steps.push({ show: i, typing: true, ms: 1100 });
    steps.push({ show: i + 1, typing: false, ms: line.from === "ai" ? 1700 : 1100 });
  });
  steps[steps.length - 1] = { ...steps[steps.length - 1], ms: 3600 };
  return steps;
}

function useChat(script: readonly ChatLine[], running: boolean) {
  const steps = timeline(script);
  const step = useSequence(
    steps.map((s) => s.ms),
    running,
  );
  return steps[step];
}

/* ------------------------------------------------------------------ */

function PhoneShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`site-phone mx-auto h-[520px] w-[260px] text-left ${className}`}>
      <span className="site-phone-notch" />
      <div className="site-phone-screen">{children}</div>
    </div>
  );
}

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex h-9 items-end justify-between px-6 pb-1 text-[11px] font-semibold ${dark ? "text-white" : "text-[#151713]"}`}>
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-current" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[10px] w-[20px] rounded-[3px] border border-current p-[1px]">
          <span className="block h-full w-3/4 rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  );
}

function Typing({ className }: { className: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] rounded-2xl px-3 py-2.5 ${className}`}>
      <span className="site-typing inline-flex gap-[3px]">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

/* ----------------------------------------------------------- WhatsApp */

export function WhatsAppPhone({
  business,
  script,
  className = "",
}: {
  business: string;
  script: readonly ChatLine[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView } = useInView(ref);
  const state = useChat(script, inView);

  return (
    <div ref={ref} className={className}>
      <PhoneShell>
        <div className="flex h-full flex-col bg-[#EFEAE2]">
          <div className="bg-white">
            <StatusBar />
            <div className="flex items-center gap-2 border-b border-black/5 px-3 pb-2.5 pt-1.5">
              <ChevronLeft className="size-5 text-[#008069]" aria-hidden="true" />
              <span className="flex size-8 items-center justify-center rounded-full bg-[#DCF8C6] text-[11px] font-semibold text-[#075E54]">
                {business.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-[#111b21]">
                  {business}
                  <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true">
                    <circle cx="6" cy="6" r="6" fill="#25D366" />
                    <path d="M3.4 6.2 5.2 8l3.4-3.6" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </p>
                <p className="text-[10px] text-[#667781]">{state.typing ? "typing…" : "Business account"}</p>
              </div>
              <Video className="size-4 text-[#54656f]" aria-hidden="true" />
              <Phone className="size-4 text-[#54656f]" aria-hidden="true" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 pb-2.5">
            {script.map((line, i) => (
              <div key={i} className="site-grow" data-on={i < state.show}>
                <div className={`flex pt-0.5 ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[84%] rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
                      line.from === "customer" ? "rounded-tr-none bg-[#D9FDD3]" : "rounded-tl-none bg-white"
                    }`}
                  >
                    {line.text}
                    {line.from === "ai" && line.card ? <div className="mt-1.5">{line.card}</div> : null}
                    <span className="mt-0.5 block text-right text-[9px] text-[#667781]">
                      10:4{i}
                      {line.from === "customer" ? <span className="ml-1 text-[#53bdeb]">✓✓</span> : null}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div className="site-grow" data-on={state.typing}>
              <div className="pt-0.5">
                <Typing className="rounded-tl-none bg-white text-[#667781] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[#F0F2F5] px-2.5 py-2">
            <span className="h-8 flex-1 rounded-full bg-white px-3 text-[11px] leading-8 text-[#8696a0]">Message</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-[#00A884] text-white">
              <Send className="size-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </PhoneShell>
    </div>
  );
}

/* ---------------------------------------------------------- Instagram */

export function InstagramPhone({
  handle,
  script,
  className = "",
}: {
  handle: string;
  script: readonly ChatLine[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView } = useInView(ref);
  const state = useChat(script, inView);

  return (
    <div ref={ref} className={className}>
      <PhoneShell>
        <div className="flex h-full flex-col bg-white">
          <StatusBar />
          <div className="flex items-center gap-2 border-b border-black/5 px-3 pb-2.5 pt-1.5">
            <ChevronLeft className="size-5 text-[#151713]" aria-hidden="true" />
            <span className="rounded-full bg-[conic-gradient(from_200deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5,#feda75)] p-[2px]">
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#f4efe9] text-[10px] font-semibold text-[#151713]">
                {handle.slice(0, 1).toUpperCase()}
              </span>
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12.5px] font-semibold text-[#151713]">{handle}</p>
              <p className="text-[10px] text-[#737373]">{state.typing ? "Typing…" : "Active now"}</p>
            </div>
            <Phone className="size-4 text-[#151713]" aria-hidden="true" />
            <Video className="size-4 text-[#151713]" aria-hidden="true" />
          </div>
          <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-3 pb-3">
            {script.map((line, i) => (
              <div key={i} className="site-grow" data-on={i < state.show}>
                <div className={`flex pt-0.5 ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-[18px] px-3 py-2 text-[11.5px] leading-[1.4] ${
                      line.from === "customer"
                        ? "bg-[linear-gradient(135deg,#7638fa,#a33ee0_55%,#d300c5)] text-white"
                        : "bg-[#efefef] text-[#151713]"
                    }`}
                  >
                    {line.text}
                    {line.from === "ai" && line.card ? <div className="mt-1.5">{line.card}</div> : null}
                  </div>
                </div>
              </div>
            ))}
            <div className="site-grow" data-on={state.typing}>
              <div className="pt-0.5">
                <Typing className="bg-[#efefef] text-[#737373]" />
              </div>
            </div>
          </div>
          <div className="px-3 pb-3">
            <span className="flex h-9 items-center rounded-full border border-[#dbdbdb] px-3.5 text-[11px] text-[#8e8e8e]">
              Message…
            </span>
          </div>
        </div>
      </PhoneShell>
    </div>
  );
}

/* ------------------------------------------------------------ Website */

export function WebsiteWidget({
  business,
  script,
  className = "",
  compact = false,
}: {
  business: string;
  script: readonly ChatLine[];
  className?: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView } = useInView(ref);
  const state = useChat(script, inView);

  return (
    <div
      ref={ref}
      className={`flex flex-col overflow-hidden rounded-[22px] border text-left border-black/[0.07] bg-white shadow-[0_30px_70px_-30px_rgba(21,23,19,0.45)] ${
        compact ? "h-[420px]" : "h-[480px]"
      } mx-auto w-full max-w-[340px] ${className}`}
    >
      <div className="flex items-center gap-2.5 bg-[#151713] px-4 py-3.5 text-white">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#b2ff38] text-[#11160a]">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{business}</p>
          <p className="flex items-center gap-1.5 text-[10.5px] text-white/60">
            <span className="size-1.5 rounded-full bg-[#4fcf8c]" />
            {state.typing ? "Typing…" : "Online · replies instantly"}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden bg-[#f6f7f5] px-3.5 pb-3">
        {script.map((line, i) => (
          <div key={i} className="site-grow" data-on={i < state.show}>
            <div className={`flex pt-0.5 ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-[1.45] ${
                  line.from === "customer"
                    ? "rounded-br-md bg-[#203509] text-white"
                    : "rounded-bl-md border border-black/[0.06] bg-white text-[#151713]"
                }`}
              >
                {line.text}
                {line.from === "ai" && line.card ? <div className="mt-2">{line.card}</div> : null}
              </div>
            </div>
          </div>
        ))}
        <div className="site-grow" data-on={state.typing}>
          <div className="pt-0.5">
            <Typing className="rounded-bl-md border border-black/[0.06] bg-white text-[#61665d]" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-black/[0.06] bg-white px-3 py-2.5">
        <span className="flex-1 text-[12px] text-[#8a8e86]">Ask anything…</span>
        <span className="flex size-8 items-center justify-center rounded-full bg-[#151713] text-white">
          <Send className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="bg-white pb-2 text-center text-[9.5px] text-[#8a8e86]">Powered by Waves AI Pilot</p>
    </div>
  );
}

/* -------------------------------------------------------- Inline cards */

export function SlotCard({ day, time }: { day: string; time: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#f6fbef] px-2.5 py-2 text-[11px] text-[#151713]">
      <CalendarCheck className="size-4 text-[#1f7a4c]" aria-hidden="true" />
      <span className="leading-tight">
        <span className="block font-semibold">Request sent · {day}</span>
        <span className="text-[#61665d]">{time} · awaiting confirmation</span>
      </span>
    </span>
  );
}

export function ProductCard({ name, price, tint }: { name: string; price: string; tint: string }) {
  return (
    <span className="flex w-[150px] flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white text-[11px] text-[#151713]">
      <span className="h-14" style={{ background: tint }} />
      <span className="px-2 py-1.5 leading-tight">
        <span className="block font-semibold">{name}</span>
        <span className="text-[#61665d]">{price}</span>
      </span>
    </span>
  );
}

/* ---------------------------------------------------- Sample scripts */

export const WHATSAPP_SCRIPT: readonly ChatLine[] = [
  { from: "customer", text: "Hi, do you do teeth whitening? How much is it?" },
  { from: "ai", text: "Yes! In-clinic whitening is ₹6,500 and takes about an hour. Would you like to book a consultation first?" },
  { from: "customer", text: "Yes, Saturday morning if possible" },
  { from: "ai", text: "Saturday 10:30 AM is free. May I have your name to request it?", card: <SlotCard day="Sat" time="10:30 AM" /> },
];

export const INSTAGRAM_SCRIPT: readonly ChatLine[] = [
  { from: "customer", text: "Is the linen co-ord set still available in M?" },
  { from: "ai", text: "It is! The sage linen co-ord is ₹2,890. You might also like the matching overshirt:", card: <ProductCard name="Linen overshirt" price="₹1,690" tint="linear-gradient(135deg,#dfe7cf,#c9d6b0)" /> },
  { from: "customer", text: "Love it. Can someone call me?" },
  { from: "ai", text: "Of course. Share your number and our team will call you back today." },
];

export const WEBSITE_SCRIPT: readonly ChatLine[] = [
  { from: "customer", text: "Do you have 2BHK flats near Gachibowli under ₹90L?" },
  { from: "ai", text: "Yes, two projects fit: Palm Grove (₹78L) and Cedar Heights (₹86L). Is this for living in or investment?" },
  { from: "customer", text: "Living in. Can I visit this weekend?" },
  { from: "ai", text: "Sunday 11:00 AM works for a site visit at Palm Grove. Shall I request it?", card: <SlotCard day="Sun" time="11:00 AM" /> },
];

export { WhatsAppIcon, InstagramIcon };

export const AGENT_SCRIPT: readonly ChatLine[] = [
  { from: "customer", text: "I need a laptop for video editing" },
  { from: "ai", text: "Happy to help! What's your budget, and do you edit 4K footage?" },
  { from: "customer", text: "Around ₹1.2L, yes 4K. Isn't that too little?" },
  {
    from: "ai",
    text: "It's enough. The Creator 14 (₹1,14,990) has the 4K-ready GPU you need. Want me to book a store demo?",
    card: <ProductCard name="Creator 14 · RTX 4060" price="₹1,14,990" tint="linear-gradient(135deg,#e3e7ee,#c9d0dc)" />,
  },
];
