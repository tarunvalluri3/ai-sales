"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { AnnouncementSeverity } from "@/lib/supabase/types";

type Announcement = { id: string; message: string; severity: AnnouncementSeverity };

const SEVERITY_CLASS: Record<AnnouncementSeverity, string> = {
  info: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warning: "bg-ds-warning-bg text-ds-warning",
  critical: "bg-ds-danger-bg text-ds-danger",
};

const DISMISSED_STORAGE_KEY = "dashboard-dismissed-announcements";

/**
 * Phase 33 Stop 5 (docs/phases.md): platform-owner announcements
 * (lib/announcements.ts), shown above the dashboard content. Dismissal is
 * per-browser localStorage only, by design -- an announcement has no
 * per-tenant acknowledgement requirement in the approved brief, so this
 * stays as simple as the ContactEmailGate's own storage usage rather than
 * adding a new table/column just to track "has this been seen".
 */
export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Private browsing / storage disabled -- dismissal just won't persist across reloads.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {visible.map((a) => (
        <div key={a.id} className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${SEVERITY_CLASS[a.severity]}`}>
          <span>{a.message}</span>
          <button type="button" onClick={() => dismiss(a.id)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
