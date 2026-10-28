"use client";

import { PLAN_KEYS, PLANS } from "@/lib/plans";

/** GET form -- the server component page re-renders from searchParams on submit, matching this codebase's existing filter pattern (e.g. customers' segment tabs). No client-side state to keep in sync. */
export function TenantFilters({ initial }: { initial: { q?: string; plan?: string; status?: string } }) {
  return (
    <form action="/apache/tenants" method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={initial.q ?? ""}
          placeholder="Name, email, phone, or ID"
          className="w-64 rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Plan</span>
        <select
          name="plan"
          defaultValue={initial.plan ?? ""}
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <option value="">All plans</option>
          {PLAN_KEYS.map((key) => (
            <option key={key} value={key}>
              {PLANS[key].name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Status</span>
        <select
          name="status"
          defaultValue={initial.status ?? ""}
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </label>
      <button
        type="submit"
        className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        Filter
      </button>
    </form>
  );
}
