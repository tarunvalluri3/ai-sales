"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * What the live preview panel renders. Seeded server-side from whatever
 * real data already exists (business name/description, first product,
 * first FAQ, greeting), then updated client-side as the business types
 * in the current step -- a cheap, honest "live" preview: it reflects
 * this step's in-progress fields instantly, without inventing a second
 * autosave-to-the-database path for every keystroke (see STATE.md entry
 * for this change for why that's out of scope).
 */
export type OnboardingPreviewData = {
  businessName: string;
  description: string | null;
  greeting: string | null;
  firstProductName: string | null;
  firstFaqQuestion: string | null;
  firstFaqAnswer: string | null;
  essentialsDone: number;
  essentialsTotal: number;
};

type PreviewContextValue = {
  preview: OnboardingPreviewData;
  update: (patch: Partial<OnboardingPreviewData>) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function OnboardingPreviewProvider({
  seed,
  children,
}: {
  seed: OnboardingPreviewData;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(seed);
  const value = useMemo<PreviewContextValue>(
    () => ({
      preview,
      update: (patch) => setPreview((prev) => ({ ...prev, ...patch })),
    }),
    [preview],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function useOnboardingPreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error("useOnboardingPreview must be used inside OnboardingPreviewProvider");
  }
  return ctx;
}
