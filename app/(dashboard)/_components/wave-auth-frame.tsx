"use client";

import Link from "next/link";
import { SignIn, SignUp, TaskChooseOrganization } from "@clerk/nextjs";
import { ThemeToggle } from "./theme-toggle";
import { ThemedWavesLogo } from "./waves-logo";
import { useWaveClerkAppearance } from "./wave-clerk-appearance";

export function WaveAuthFrame({ screen }: { screen: "sign-in" | "sign-up" | "choose-organization" }) {
  const appearance = useWaveClerkAppearance();
  return (
    <div className="dash-shell wave-auth flex min-h-dvh flex-1 flex-col">
      <header className="border-b border-ds-border bg-ds-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="inline-flex rounded-lg" aria-label="Waves AI Pilot home">
            <ThemedWavesLogo />
          </Link>
          <ThemeToggle className="!size-11 rounded-xl" />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 items-center justify-center px-4 py-8 sm:py-12">
        {screen === "sign-in" && <SignIn appearance={appearance} />}
        {screen === "sign-up" && <SignUp appearance={appearance} />}
        {screen === "choose-organization" && (
          <TaskChooseOrganization redirectUrlComplete="/dashboard" appearance={appearance} />
        )}
      </main>
    </div>
  );
}
