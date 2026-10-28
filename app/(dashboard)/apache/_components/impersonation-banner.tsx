"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { endImpersonation } from "@/lib/admin-impersonation-actions";

/**
 * Persistent across every /apache page while a Support Tools impersonation
 * session is active (rendered by app/(dashboard)/apache/layout.tsx, which
 * reads the session server-side on every request) -- not just the tenant
 * detail page being viewed. Countdown is a client-side display only; the
 * session's real deadline is the cookie's own `maxAge`
 * (lib/admin-impersonation-actions.ts).
 */
export function ImpersonationBanner({ businessName, expiresAtIso }: { businessName: string; expiresAtIso: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(expiresAtIso));

  useEffect(() => {
    const interval = setInterval(() => setRemainingSeconds(secondsUntil(expiresAtIso)), 1000);
    return () => clearInterval(interval);
  }, [expiresAtIso]);

  if (remainingSeconds <= 0) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  function handleExit() {
    startTransition(async () => {
      await endImpersonation();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-ds-warning-bg px-4 py-2 text-sm text-ds-warning">
      <span className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        Viewing <strong className="font-semibold">{businessName}</strong> read-only -- expires in {minutes}:{String(seconds).padStart(2, "0")}
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={isPending}
        className="shrink-0 rounded-ds-sm border border-ds-warning px-3 py-1 text-xs font-medium transition-colors hover:bg-ds-warning/10 disabled:opacity-40"
      >
        {isPending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}
