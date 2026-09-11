import { Camera, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";

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
 * Replaces WhatsApp's manual-paste form entirely -- Instagram business
 * messaging requires going through Meta's own OAuth dialog via this
 * app's Meta App, so there is nothing to type in. A plain `<a>` (not a
 * Server Action) is required: this needs a real top-level browser
 * navigation to /api/oauth/instagram/authorize, which itself redirects
 * to Meta -- a Server Action cannot produce a cross-origin redirect.
 */
export function ConnectInstagramButton() {
  return (
    <section className="flex flex-col gap-6 rounded-ds-lg border border-ds-border bg-ds-surface p-6">
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-ds-lg bg-[linear-gradient(135deg,#feda75_0%,#fa7e1e_25%,#d62976_50%,#962fbf_75%,#4f5bd5_100%)] text-white shadow-sm"
        >
          <Camera className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ds-text-primary">Connect your Instagram account</h2>
          <p className="max-w-md text-sm text-ds-text-secondary">
            Link an Instagram professional account through Meta so prospects can message your AI sales
            employee on Instagram, just like they can on your website.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex flex-col gap-1.5 rounded-ds-md bg-ds-surface-soft p-3">
            <benefit.icon className="size-4 text-ds-accent" aria-hidden="true" />
            <p className="text-xs font-medium text-ds-text-primary">{benefit.title}</p>
            <p className="text-xs text-ds-text-muted">{benefit.description}</p>
          </li>
        ))}
      </ul>

      <a
        href="/api/oauth/instagram/authorize"
        className="inline-flex w-fit items-center gap-2 rounded-ds-md bg-ds-accent px-4 py-2.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        <Camera className="size-4" aria-hidden="true" />
        Connect with Instagram
      </a>
    </section>
  );
}
