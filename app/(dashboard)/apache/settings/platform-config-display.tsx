import type { getPlatformSettingsSnapshot } from "@/lib/admin-settings";

/**
 * Read-only by deliberate scope decision -- see lib/admin-settings.ts's
 * own header for why trial length and plan limits are not made
 * DB-editable in this stop.
 */
export function PlatformConfigDisplay({ settings }: { settings: ReturnType<typeof getPlatformSettingsSnapshot> }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="bg-ds-surface-soft px-3 py-2 text-xs text-ds-text-secondary">
        These figures are the live source of truth (lib/plans.ts, lib/gemini-pricing.ts) -- changing any of them requires a code change and a new deploy, by deliberate design (see those files&apos; own headers), not an admin-UI edit.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-ds-border bg-ds-surface p-4">
          <p className="text-xs text-ds-text-muted">Trial length</p>
          <p className="text-lg font-medium text-ds-text-primary">{settings.trialDays} days</p>
        </div>
        <div className="border border-ds-border bg-ds-surface p-4">
          <p className="text-xs text-ds-text-muted">Trial reply quota (TRIAL_REPLY_QUOTA)</p>
          <p className="text-lg font-medium text-ds-text-primary">{settings.trialReplyQuota.toLocaleString()}</p>
          <p className="text-2xs text-ds-text-muted">Last-known plan kept {settings.subscriptionLastKnownMaxHours} h on a read failure</p>
        </div>
        <div className="border border-ds-border bg-ds-surface p-4">
          <p className="text-xs text-ds-text-muted">Past-due grace period</p>
          <p className="text-lg font-medium text-ds-text-primary">{settings.pastDueGraceDays} days</p>
        </div>
      </div>

      <div className="overflow-x-auto border border-ds-border">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-soft text-left text-xs text-ds-text-muted">
            <tr>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Monthly</th>
              <th className="px-3 py-2">Annual</th>
              <th className="px-3 py-2">Reply quota</th>
              <th className="px-3 py-2">Channels</th>
            </tr>
          </thead>
          <tbody>
            {settings.plans.map((plan) => (
              <tr key={plan.key} className="border-t border-ds-border">
                <td className="px-3 py-2 text-ds-text-primary">{plan.name}</td>
                <td className="px-3 py-2 text-ds-text-secondary">₹{(plan.monthlyPricePaise / 100).toLocaleString()}</td>
                <td className="px-3 py-2 text-ds-text-secondary">₹{(plan.annualPricePaise / 100).toLocaleString()}</td>
                <td className="px-3 py-2 text-ds-text-secondary">{plan.monthlyReplyQuota.toLocaleString()}</td>
                <td className="px-3 py-2 text-ds-text-secondary">
                  {Object.entries(plan.channels)
                    .filter(([, enabled]) => enabled)
                    .map(([channel]) => channel)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto border border-ds-border">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-soft text-left text-xs text-ds-text-muted">
            <tr>
              <th className="px-3 py-2">Gemini model</th>
              <th className="px-3 py-2">Input / 1M tokens</th>
              <th className="px-3 py-2">Output / 1M tokens</th>
              <th className="px-3 py-2">Effective from</th>
            </tr>
          </thead>
          <tbody>
            {settings.geminiPricing.map((row) => (
              <tr key={`${row.model}-${row.effectiveFrom}`} className="border-t border-ds-border">
                <td className="px-3 py-2 text-ds-text-primary">{row.model}</td>
                <td className="px-3 py-2 text-ds-text-secondary">${row.inputPerMillionUsd}</td>
                <td className="px-3 py-2 text-ds-text-secondary">${row.outputPerMillionUsd}</td>
                <td className="px-3 py-2 text-ds-text-secondary">{row.effectiveFrom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
