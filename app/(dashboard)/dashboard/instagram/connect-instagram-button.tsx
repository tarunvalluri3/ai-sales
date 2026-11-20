import { Camera, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { INSTAGRAM_CONNECT_PATH, ONBOARDING_INSTAGRAM_CONNECT_PATH } from "./connect-path";

const BENEFITS = [
  {
    icon: MessageCircle,
    title: "Answers DMs automatically",
    description: "Your AI sales employee replies to Instagram messages the same way it does on your website.",
  },
  {
    icon: Sparkles,
    title: "One shared brain",
    description: "Same knowledge, products, and escalation rules as your website and WhatsApp — nothing to duplicate.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    description: "Take over any conversation from your dashboard at any time, exactly like every other channel.",
  },
];

/**
 * Starts Meta's login (Instagram API with Facebook Login by default). A plain
 * <a>: it must be a top-level navigation to the connect route, which
 * redirects to Meta (a Server Action cannot redirect cross-origin).
 */
export function ConnectInstagramButton({ onboarding = false }: { onboarding?: boolean }) {
  return (
    <section className="dx-card flex h-full flex-col gap-6 dx-card-pad">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary"
        >
          <Camera strokeWidth={1.75} className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="dx-title">Connect your Instagram account</h2>
          <p className="max-w-md text-sm text-ds-text-secondary">
            Log in with Facebook and choose the Facebook Page linked to your Instagram professional account.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex flex-col gap-1.5 rounded-2xl bg-ds-surface-soft p-4">
            <benefit.icon strokeWidth={1.75} className="size-5 text-ds-accent" aria-hidden="true" />
            <p className="text-xs font-medium text-ds-text-primary">{benefit.title}</p>
            <p className="text-xs text-ds-text-secondary">{benefit.description}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-ds-text-secondary">
          We need access to read and reply to Instagram DMs for this business.
        </p>
        <a
          href={onboarding ? ONBOARDING_INSTAGRAM_CONNECT_PATH : INSTAGRAM_CONNECT_PATH}
          className="ds-btn-label inline-flex h-9 w-fit items-center gap-2 rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          <Camera strokeWidth={1.75} className="size-4" aria-hidden="true" />
          Connect Instagram
        </a>
      </div>
    </section>
  );
}
