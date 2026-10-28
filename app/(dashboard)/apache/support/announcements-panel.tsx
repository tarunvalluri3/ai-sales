"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge, type BadgeTone } from "@/app/(dashboard)/dashboard/_components/badge";
import { ConfirmActionDialog } from "../_components/confirm-action-dialog";
import { createAnnouncement, setAnnouncementActive, deleteAnnouncement } from "@/lib/admin-announcement-actions";
import type { AnnouncementSeverity, PlatformAnnouncement } from "@/lib/supabase/types";

type Tenant = { id: string; name: string };

const SEVERITY_TONE: Record<AnnouncementSeverity, BadgeTone> = { info: "accent", warning: "warning", critical: "danger" };

export function AnnouncementsPanel({ announcements, tenants }: { announcements: PlatformAnnouncement[]; tenants: Tenant[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tenantsById = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);

  function handleToggle(id: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setAnnouncementActive(id, active);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}
      <NewAnnouncementForm tenants={tenants} onCreated={() => router.refresh()} />

      {announcements.length === 0 ? (
        <p className="rounded-ds-lg border border-dashed border-ds-border py-10 text-center text-sm text-ds-text-secondary">No announcements yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {announcements.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                    <Badge tone={a.active ? "success" : "muted"}>{a.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-sm text-ds-text-primary">{a.message}</p>
                  <p className="text-xs text-ds-text-muted">
                    {a.target_type === "all"
                      ? "All tenants"
                      : `${a.target_business_ids?.length ?? 0} tenant${(a.target_business_ids?.length ?? 0) === 1 ? "" : "s"}: ${(a.target_business_ids ?? [])
                          .map((id) => tenantsById.get(id) ?? id)
                          .join(", ")}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
                    Active
                    <input type="checkbox" checked={a.active} disabled={isPending} onChange={(e) => handleToggle(a.id, e.target.checked)} />
                  </label>
                  <ConfirmActionDialog
                    trigger={(open) => (
                      <button type="button" onClick={open} className="text-xs font-medium text-ds-danger hover:underline">
                        Delete
                      </button>
                    )}
                    title="Delete this announcement?"
                    description="It will stop appearing for every tenant it currently targets. This cannot be undone."
                    dangerous
                    onConfirm={(reason) => deleteAnnouncement(a.id, reason)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewAnnouncementForm({ tenants, onCreated }: { tenants: Tenant[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [targetAll, setTargetAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return tenants.filter((t) => t.name.toLowerCase().includes(term)).slice(0, 8);
  }, [tenants, search]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createAnnouncement({
        message: message.trim(),
        severity,
        targetBusinessIds: targetAll ? null : [...selected],
      });
      if (result.ok) {
        setMessage("");
        setSeverity("info");
        setTargetAll(true);
        setSelected(new Set());
        setOpen(false);
        onCreated();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-2 rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover"
      >
        <Plus className="size-4" aria-hidden="true" /> New announcement
      </button>
    );
  }

  const canSubmit = message.trim().length >= 3 && (targetAll || selected.size > 0);

  return (
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ds-text-primary">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ds-text-primary">Severity</span>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)} className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary">
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
          <input type="radio" checked={targetAll} onChange={() => setTargetAll(true)} /> All tenants
        </label>
        <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
          <input type="radio" checked={!targetAll} onChange={() => setTargetAll(false)} /> Selected tenants
        </label>
        {!targetAll ? (
          <div className="flex flex-col gap-2 pl-6">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants to add…"
              className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
            />
            {filtered.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {filtered.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} /> {t.name}
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected.size > 0 ? <p className="text-xs text-ds-text-muted">{selected.size} tenant{selected.size === 1 ? "" : "s"} selected.</p> : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-ds-sm px-3 py-1.5 text-sm font-medium text-ds-text-secondary hover:bg-ds-surface-soft">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !canSubmit}
          className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create announcement"}
        </button>
      </div>
    </div>
  );
}
