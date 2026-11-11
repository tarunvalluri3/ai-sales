import { Camera, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { INSTAGRAM_CONNECT_PATH } from "./connect-path";

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
export function ConnectInstagramButton() {
  return (
    <section className="flex flex-col gap-6 border border-ds-border bg-ds-surface p-6">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center border border-ds-border bg-ds-surface-raised text-ds-text-primary"
        >
          <Camera className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-ds-text-primary">Connect your Instagram account</h2>
          <p className="max-w-md text-sm text-ds-text-secondary">
            Log in with Facebook and choose the Facebook Page linked to your Instagram professional account.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex flex-col gap-1.5 bg-ds-surface-soft p-3">
            <benefit.icon className="size-4 text-ds-accent" aria-hidden="true" />
            <p className="text-xs font-medium text-ds-text-primary">{benefit.title}</p>
            <p className="text-xs text-ds-text-muted">{benefit.description}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-ds-text-secondary">
          We need access to read and reply to Instagram DMs for this business.
        </p>
        <a
          href={INSTAGRAM_CONNECT_PATH}
          className="ds-btn-label inline-flex w-fit items-center gap-2 bg-ds-primary px-4 py-2.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
        >
          <Camera className="size-4" aria-hidden="true" />
          Connect Instagram
        </a>
      </div>
    </section>
  );
}
