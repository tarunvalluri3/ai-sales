"use client";

import { useState, useTransition } from "react";
import { revealLeadContactAction } from "@/lib/admin-conversation-actions";

export function RevealButton({ leadId, businessId }: { leadId: string; businessId: string }) {
  const [revealed, setRevealed] = useState<{ email: string | null; phone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (revealed) {
    return (
      <span className="text-2xs text-ds-text-muted">
        {revealed.email ?? "—"} {revealed.phone ? `· ${revealed.phone}` : ""}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await revealLeadContactAction(leadId, businessId);
            if (result.ok) setRevealed(result.contact);
            else setError(result.error);
          })
        }
        disabled={isPending}
        className="text-2xs font-medium text-ds-accent-muted hover:text-ds-text-primary disabled:opacity-50"
      >
        {isPending ? "Revealing…" : "Reveal (logged)"}
      </button>
      {error ? <span className="text-2xs text-ds-danger">{error}</span> : null}
    </div>
  );
}
