import { UserButton } from "@clerk/nextjs";
import { Search } from "lucide-react";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";

/**
 * The /apache top bar: global search (wired to the Tenants page's `q`
 * query param, built in Stop 2 -- the input exists now per the approved
 * layout requirement, but has nothing to search against until then),
 * an environment badge, and the admin's own Clerk profile menu. No
 * OrganizationSwitcher here, unlike the tenant dashboard's header -- a
 * platform admin does not act within any tenant's Clerk Organization.
 */
export function AdminHeader() {
  const environment = resolveEnvironmentLabel();

  return (
    <header className="flex items-center justify-between gap-3 border-b border-ds-border bg-ds-surface px-4 py-2.5">
      <form action="/apache/tenants" method="get" className="flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-surface-soft px-3 py-1.5">
        <Search className="size-3.5 shrink-0 text-ds-text-muted" aria-hidden="true" />
        <input
          type="search"
          name="q"
          placeholder="Search tenant name, owner email, phone, or tenant ID..."
          className="w-full min-w-0 bg-transparent text-xs text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none"
          aria-label="Search tenants"
        />
      </form>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide-ds ${
            environment === "Production" ? "bg-ds-warning/20 text-ds-warning" : "bg-ds-surface-soft text-ds-text-muted"
          }`}
        >
          {environment}
        </span>
        <UserButton appearance={clerkDarkCompactAppearance} />
      </div>
    </header>
  );
}

function resolveEnvironmentLabel(): "Production" | "Staging" | "Development" {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "Production";
  if (vercelEnv === "preview") return "Staging";
  return "Development";
}
