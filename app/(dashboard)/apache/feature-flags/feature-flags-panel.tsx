"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { ConfirmActionDialog } from "../_components/confirm-action-dialog";
import {
  createFeatureFlag,
  setFeatureFlagDefault,
  setTenantFlagOverride,
  clearTenantFlagOverride,
  deleteFeatureFlag,
} from "@/lib/feature-flag-actions";
import type { FeatureFlagWithOverrides } from "@/lib/feature-flags";

type Tenant = { id: string; name: string };

export function FeatureFlagsPanel({
  flags,
  tenants,
  canDelete,
}: {
  flags: FeatureFlagWithOverrides[];
  tenants: Tenant[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDefaultToggle(key: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setFeatureFlagDefault(key, next);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}
      <NewFlagForm onCreated={() => router.refresh()} />

      <div className="flex flex-col gap-3">
        {flags.length === 0 ? (
          <p className="rounded-ds-lg border border-dashed border-ds-border py-10 text-center text-sm text-ds-text-secondary">No feature flags yet.</p>
        ) : null}
        {flags.map((flag) => (
          <div key={flag.key} className="rounded-ds-lg border border-ds-border bg-ds-surface">
            <div className="flex items-center justify-between gap-3 p-4">
              <button
                type="button"
                onClick={() => toggleExpanded(flag.key)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                {expanded.has(flag.key) ? (
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-sm text-ds-text-primary">{flag.key}</span>
                  <span className="text-sm text-ds-text-secondary">{flag.description}</span>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={flag.overrides.length > 0 ? "accent" : "muted"}>{flag.overrides.length} override{flag.overrides.length === 1 ? "" : "s"}</Badge>
                <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
                  Default
                  <input
                    type="checkbox"
                    checked={flag.default_enabled}
                    disabled={isPending}
                    onChange={(e) => handleDefaultToggle(flag.key, e.target.checked)}
                  />
                </label>
                {canDelete ? (
                  <ConfirmActionDialog
                    trigger={(open) => (
                      <button type="button" onClick={open} className="text-xs font-medium text-ds-danger hover:underline">
                        Delete
                      </button>
                    )}
                    title={`Delete "${flag.key}"?`}
                    description="Product code checking this flag will simply get `false` back afterward. This cannot be undone."
                    dangerous
                    onConfirm={(reason) => deleteFeatureFlag(flag.key, reason)}
                  />
                ) : null}
              </div>
            </div>
            {expanded.has(flag.key) ? (
              <div className="border-t border-ds-border p-4">
                <TenantOverrides flagKey={flag.key} overrides={flag.overrides} tenants={tenants} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewFlagForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [defaultEnabled, setDefaultEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createFeatureFlag({ key: key.trim(), description: description.trim(), defaultEnabled });
      if (result.ok) {
        setKey("");
        setDescription("");
        setDefaultEnabled(false);
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
        <Plus className="size-4" aria-hidden="true" /> New flag
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ds-text-primary">Key</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="widget.new_chat_bubble"
            className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 font-mono text-sm text-ds-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ds-text-primary">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
        <input type="checkbox" checked={defaultEnabled} onChange={(e) => setDefaultEnabled(e.target.checked)} />
        Enabled by default
      </label>
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-ds-sm px-3 py-1.5 text-sm font-medium text-ds-text-secondary hover:bg-ds-surface-soft">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || key.trim().length === 0 || description.trim().length < 3}
          className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create flag"}
        </button>
      </div>
    </div>
  );
}

function TenantOverrides({
  flagKey,
  overrides,
  tenants,
}: {
  flagKey: string;
  overrides: { business_id: string; enabled: boolean }[];
  tenants: Tenant[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const overrideByBusinessId = useMemo(() => new Map(overrides.map((o) => [o.business_id, o.enabled])), [overrides]);
  const tenantsById = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return tenants.filter((t) => t.name.toLowerCase().includes(term)).slice(0, 8);
  }, [tenants, search]);

  function handleSet(businessId: string, enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setTenantFlagOverride(flagKey, businessId, enabled);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function handleClear(businessId: string) {
    setError(null);
    startTransition(async () => {
      const result = await clearTenantFlagOverride(flagKey, businessId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-ds-danger">{error}</p> : null}

      {overrides.length === 0 ? (
        <p className="text-sm text-ds-text-muted">No tenant overrides.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {overrides.map((o) => (
            <li key={o.business_id} className="flex items-center justify-between gap-3 rounded-ds-sm bg-ds-surface-soft px-3 py-2 text-sm">
              <span className="truncate text-ds-text-primary">{tenantsById.get(o.business_id) ?? o.business_id}</span>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={o.enabled ? "success" : "muted"}>{o.enabled ? "Enabled" : "Disabled"}</Badge>
                <button type="button" disabled={isPending} onClick={() => handleClear(o.business_id)} className="text-xs font-medium text-ds-text-secondary hover:underline">
                  Clear
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant to add an override…"
          className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
        />
        {filtered.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-ds-sm border border-ds-border px-3 py-1.5 text-sm">
                <span className="truncate text-ds-text-primary">{t.name}</span>
                {overrideByBusinessId.has(t.id) ? (
                  <span className="text-xs text-ds-text-muted">Already overridden</span>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" disabled={isPending} onClick={() => handleSet(t.id, true)} className="text-xs font-medium text-ds-success hover:underline">
                      Force on
                    </button>
                    <button type="button" disabled={isPending} onClick={() => handleSet(t.id, false)} className="text-xs font-medium text-ds-danger hover:underline">
                      Force off
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
