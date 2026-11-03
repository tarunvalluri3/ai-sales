/**
 * Trial vs Starter channel wording (production readiness round 3, item 3).
 * Pure (no server-only, no env): the pricing page, the onboarding trial step
 * and the billing plan picker (a client component) all use it, so the three
 * screens say the same thing. Plan access itself is unchanged and lives in
 * lib/plans.ts (PLANS[*].channels) and lib/entitlement-rules.ts.
 */
import type { ChannelLaunchSwitches } from "@/lib/entitlement-rules";

export type PlanKeyForCopy = "starter" | "growth" | "scale";

/**
 * Which Meta channels are connected right now (status "connected"), or null
 * when the connections couldn't be read (the warning is then shown in a
 * generic form, never silently skipped).
 */
export type ConnectedMetaChannels = { whatsapp: boolean; instagram: boolean } | null;

const META_CHANNELS_BY_PLAN: Record<PlanKeyForCopy, boolean> = { starter: false, growth: true, scale: true };

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "WhatsApp and Instagram" / "WhatsApp" / "Instagram" for the launched Meta channels, or null when neither is launched. */
export function launchedMetaChannelNames(switches: ChannelLaunchSwitches): string | null {
  const names = [...(switches.whatsapp ? ["WhatsApp"] : []), ...(switches.instagram ? ["Instagram"] : [])];
  return names.length === 0 ? null : joinNames(names);
}

/** The channel line on a plan card in the billing plan picker. */
export function planChannelsLabel(planKey: PlanKeyForCopy, metaNames: string | null): string {
  if (!META_CHANNELS_BY_PLAN[planKey] || metaNames === null) return "Website chat only";
  return `Website chat, ${metaNames}`;
}

/**
 * The trial-vs-Starter sentence for the pricing, trial and upgrade screens,
 * or null when no Meta channel is launched (then the trial and Starter have
 * the same channels and there is nothing to warn about).
 */
export function trialVsStarterNote(metaNames: string | null): string | null {
  if (metaNames === null) return null;
  return `The free trial includes ${metaNames}. Starter does not, so to keep ${metaNames} after the trial, choose Growth or Scale.`;
}

/**
 * The warning shown before a business picks Starter while a Meta channel is
 * connected, or null when Starter would not cut anything off. The picker
 * requires the owner to tick "I understand" before continuing.
 */
export function starterChannelLossWarning(selectedPlan: PlanKeyForCopy, connected: ConnectedMetaChannels): string | null {
  if (selectedPlan !== "starter") return null;
  if (connected === null) {
    return "Starter does not include WhatsApp or Instagram. If you have connected either, your AI will stop replying there once Starter is your plan. Choose Growth or Scale to keep them.";
  }
  const lost = [...(connected.whatsapp ? ["WhatsApp"] : []), ...(connected.instagram ? ["Instagram"] : [])];
  if (lost.length === 0) return null;
  const names = joinNames(lost);
  const verb = lost.length === 1 ? "is" : "are";
  return `Starter does not include ${names}. Your connected ${names} ${verb} not part of Starter, so your AI will stop replying there once Starter is your plan. Choose Growth or Scale to keep ${lost.length === 1 ? "it" : "them"}.`;
}
