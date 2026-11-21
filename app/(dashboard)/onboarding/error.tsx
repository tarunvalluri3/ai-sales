"use client";

import { ErrorState } from "../dashboard/_components/state-views";

export default function OnboardingError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <ErrorState title="We couldn’t load your setup" onRetry={retry} />
    </main>
  );
}
