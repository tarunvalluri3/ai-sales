export default function OnboardingLoading() {
  return (
    <div className="onboarding-wizard">
      <p role="status" className="sr-only">Loading onboarding…</p>
      <div className="onboarding-header" aria-hidden>
        <div className="onboarding-frame flex items-center">
          <div className="h-8 w-36 rounded-xl bg-ds-surface-soft" />
        </div>
      </div>
      <div className="onboarding-frame onboarding-grid motion-safe:animate-pulse" aria-hidden>
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-ds-surface-soft" />
          <div className="h-1.5 rounded-full bg-ds-surface-soft" />
          <div className="hidden h-72 rounded-2xl bg-ds-surface-soft md:block" />
        </div>
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded-xl bg-ds-surface-soft" />
          <div className="h-4 w-1/2 rounded bg-ds-surface-soft" />
          <div className="h-72 rounded-2xl bg-ds-surface-soft" />
          <div className="ml-auto h-11 w-28 rounded-xl bg-ds-surface-soft" />
        </div>
        <div className="hidden h-80 rounded-2xl bg-ds-surface-soft xl:block" />
      </div>
    </div>
  );
}
