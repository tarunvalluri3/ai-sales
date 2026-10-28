"use client";

import { useMemo, useState } from "react";
import { startImpersonation } from "@/lib/admin-impersonation-actions";
import { ConfirmActionDialog } from "../_components/confirm-action-dialog";

type Tenant = { id: string; name: string };

/**
 * Starting a session calls lib/admin-impersonation-actions.ts's
 * startImpersonation(), which redirects straight to
 * /apache/tenants/[businessId] on success (that page already shows
 * everything Stop 2 built: Profile/Usage/Integrations/Billing/Activity/
 * Notes, all read-only). The persistent banner lives in
 * app/(dashboard)/apache/layout.tsx, not here -- it needs to survive
 * normal navigation across the whole /apache panel, not just this page.
 */
export function ImpersonationPanel({ tenants }: { tenants: Tenant[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return tenants.filter((t) => t.name.toLowerCase().includes(term)).slice(0, 8);
  }, [tenants, search]);

  return (
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search for a tenant to view as (read-only, 30 minutes max)…"
        className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary"
      />
      {search.trim().length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-ds-text-muted">No tenant matches &quot;{search}&quot;.</p>
      ) : null}
      {filtered.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-ds-sm border border-ds-border px-3 py-2 text-sm">
              <span className="truncate text-ds-text-primary">{t.name}</span>
              <ConfirmActionDialog
                trigger={(open) => (
                  <button type="button" onClick={open} className="shrink-0 rounded-ds-sm bg-dashboard-primary px-3 py-1 text-xs font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover">
                    View as {t.name}
                  </button>
                )}
                title={`Start a read-only session viewing ${t.name}?`}
                description="You'll be taken to this tenant's detail page. The session is time-boxed to 30 minutes, shown in a banner you can exit at any time, and fully audited."
                onConfirm={(reason) => startImpersonation(t.id, reason)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
