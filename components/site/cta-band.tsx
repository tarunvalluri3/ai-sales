import type { ReactNode } from "react";
import { Btn, Reveal } from "./primitives";
import { DEMO_HREF } from "./links";
import { PilotTile } from "./brand-icons";

/** Closing call to action: a dark card on the light page (so it never merges with the dark footer). */
export function CtaBand({
  title = "Give every prospect an answer in seconds.",
  body = "Set up your AI sales employee, train it on your business and go live on your website today. WhatsApp and Instagram connect in a few clicks.",
  children,
}: {
  title?: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="px-5 pb-24 pt-4 sm:px-8 lg:px-12 lg:pb-32">
      <Reveal className="band-dark relative mx-auto max-w-[1200px] overflow-hidden rounded-[32px] px-6 py-16 text-center sm:px-12 sm:py-20">
        <div aria-hidden="true" className="site-dots-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_70%_at_50%_100%,#000,transparent)]" />
        <div aria-hidden="true" className="site-glow bottom-[-220px] left-1/2 h-[380px] w-[760px] -translate-x-1/2 opacity-45" />
        <div className="relative mx-auto flex max-w-[720px] flex-col items-center">
          <PilotTile className="size-14 rounded-2xl ring-1 ring-white/10" />
          <h2 className="site-h2 mt-7 text-ds-text-primary">{title}</h2>
          <p className="site-lead mt-5 max-w-[580px]">{body}</p>
          <div className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Btn href="/sign-up">Start your free trial</Btn>
            <Btn href={DEMO_HREF} variant="secondary">
              Book a demo
            </Btn>
          </div>
          {children}
        </div>
      </Reveal>
    </section>
  );
}
