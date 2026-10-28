"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTenantNote } from "@/lib/admin-tenant-actions";
import type { PlatformAdminNote } from "@/lib/supabase/types";

export function TenantNotes({ businessId, notes }: { businessId: string; notes: PlatformAdminNote[] }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await addTenantNote(businessId, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Add an internal note about this tenant (never visible to the tenant)…"
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        />
        {error ? <p className="text-xs text-ds-danger">{error}</p> : null}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || note.trim().length === 0}
          className="self-end rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Saving…" : "Add note"}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 text-sm text-ds-text-muted">No notes yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-ds-border rounded-ds-lg border border-ds-border bg-ds-surface">
          {notes.map((n) => (
            <div key={n.id} className="flex flex-col gap-0.5 p-3">
              <p className="text-sm whitespace-pre-wrap text-ds-text-primary">{n.note}</p>
              <span className="text-xs text-ds-text-muted">
                {n.author_user_id} · {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
