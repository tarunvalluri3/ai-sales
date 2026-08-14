/**
 * A stylized, static representation of a widget conversation and its
 * qualified-lead outcome -- illustrative chrome, not a live component. Copy
 * here is generic placeholder dialogue, not a real business's data.
 */
export function ConversationMockup() {
  return (
    <div className="w-full max-w-sm rounded-ds-lg border border-ds-border-strong bg-ds-surface p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
      <div className="mb-4 flex items-center gap-2 border-b border-ds-border pb-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-ds-accent text-xs font-semibold text-ds-accent-on">
          A
        </span>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-ds-text-primary">Acme Co. — AI Sales Employee</span>
          <span className="text-2xs text-ds-success">Online</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="max-w-[85%] self-start rounded-ds-md rounded-tl-sm bg-ds-surface-elevated px-3 py-2 text-xs text-ds-text-primary">
          Hi, does your Pro plan include onboarding support?
        </div>
        <div className="max-w-[85%] self-end rounded-ds-md rounded-tr-sm bg-ds-accent-soft-bg px-3 py-2 text-xs text-ds-text-primary">
          Yes — every Pro plan includes guided onboarding, based on our current plan details. Want me to have someone follow up with pricing for your team size?
        </div>
        <div className="max-w-[85%] self-start rounded-ds-md rounded-tl-sm bg-ds-surface-elevated px-3 py-2 text-xs text-ds-text-primary">
          Sure — here&apos;s my email.
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-ds-sm border border-ds-accent-muted bg-ds-accent-soft-bg px-3 py-2">
        <span className="text-2xs font-medium text-ds-text-primary">Lead captured · Qualification: Warm</span>
        <span className="rounded-full bg-ds-accent px-2 py-0.5 text-2xs font-semibold text-ds-accent-on">New</span>
      </div>
    </div>
  );
}
