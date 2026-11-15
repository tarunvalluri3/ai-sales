import { Check, CircleCheck, Info } from "lucide-react";
import { MESSAGE_ACCESS_HINT } from "./message-access-hint";

type GuideStep = {
  title: string;
  body: string;
  /** Whether a live connection proves this step (it could not exist otherwise). */
  provenByConnection: boolean;
};

const STEPS: GuideStep[] = [
  {
    title: "Professional account",
    body: "Your Instagram account must be a Business or Creator account, not a personal one. In the Instagram app: Settings → Account type and tools → Switch to professional account.",
    provenByConnection: true,
  },
  {
    title: "Linked Facebook Page",
    body: "On Facebook, open your Page → Settings → Linked accounts → Instagram → Connect, and log in to Instagram. No Page yet? Create one first; it only takes a minute.",
    provenByConnection: true,
  },
  {
    title: "Message access",
    // Nothing this app can observe confirms this one, so it never shows a tick.
    body: MESSAGE_ACCESS_HINT,
    provenByConnection: false,
  },
  {
    title: "Account connected",
    body: "Click “Connect Instagram”, log in with Facebook, choose the Page and its Instagram account, and approve. Your password is entered only on Facebook’s site.",
    provenByConnection: true,
  },
];

/**
 * "Connection checklist": the four things a working Instagram connection
 * needs. A live connection ticks the three steps it could not exist without
 * (professional account, linked Page, connected); message access is a setting
 * inside Instagram this app cannot read, so it always asks the owner to check.
 */
export function InstagramSetupGuide({ hasConnection }: { hasConnection: boolean }) {
  return (
    <section id="before-you-connect" className="dx-card flex h-full scroll-mt-6 flex-col gap-3 dx-card-pad">
      <div className="flex flex-col gap-0.5">
        <h2 className="dx-title flex items-center gap-3">
          <CircleCheck className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Connection checklist
        </h2>
        <p className="dx-subtitle text-base">Four checks for a working connection.</p>
      </div>

      <ol className="dx-rows flex flex-col">
        {STEPS.map((step, index) => {
          const done = hasConnection && step.provenByConnection;
          return (
            <li key={step.title} className="flex items-start gap-4 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-sm font-medium text-ds-text-primary">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="text-sm leading-snug font-medium text-ds-text-primary">{step.title}</h3>
                <p className="text-sm leading-relaxed text-ds-text-secondary">{step.body}</p>
              </div>
              {done ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary">
                  <Check className="size-5" strokeWidth={2.5} aria-hidden="true" />
                  <span className="sr-only">Done</span>
                </span>
              ) : !step.provenByConnection ? (
                <span className="flex shrink-0 items-center gap-1.5 pt-1.5 text-sm font-medium text-ds-primary">
                  <Info className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Check in Instagram
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-auto flex items-start gap-3 border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
        <Info className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Replies happen within Instagram&rsquo;s 24-hour messaging window, using the same knowledge and rules as your website.
      </p>
    </section>
  );
}
