import Link from "next/link";
import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listCustomersForBusiness } from "@/lib/customers";
import { listSegmentsForBusiness, listCustomersInSegment } from "@/lib/segments";
import { CustomerList } from "./customer-list";
import { SegmentManager } from "./segment-manager";
import { ArrowUpRight, Info, Link2 } from "lucide-react";
import { Card, PageHeader } from "../_components/ui";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const { businessId, orgRole } = await requireLiveBusinessContext();
  const canManageSegments = hasMinRole(orgRole, "org:admin");
  const { segment: segmentId } = await searchParams;

  const segments = await listSegmentsForBusiness(businessId);
  const activeSegment = segmentId ? segments.find((segment) => segment.id === segmentId) : undefined;

  const customers = activeSegment
    ? await listCustomersInSegment(businessId, activeSegment)
    : await listCustomersForBusiness(businessId);

  const pillBase =
    "inline-flex h-10 items-center rounded-full px-6 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";
  const pillActive = "bg-ds-primary font-medium text-ds-primary-on";
  const pillIdle = "border border-ds-border-strong bg-ds-surface text-ds-text-primary hover:bg-ds-surface-soft";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Customers"
        description="One profile for every prospect, across every channel."
        actions={<SegmentManager segments={segments} canManage={canManageSegments} />}
      />

      <div className="flex items-center gap-4 rounded-2xl bg-ds-surface-soft px-5 py-3 text-sm font-medium text-ds-text-primary">
        <Link2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="border-l border-ds-primary/20 pl-4">Profiles are matched by exact email or phone.</span>
      </div>

      <Card className="flex flex-col gap-5">
        {segments.length > 0 ? (
          <nav aria-label="Customer segments" className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/customers" aria-current={!activeSegment ? "page" : undefined} className={`${pillBase} ${!activeSegment ? pillActive : pillIdle}`}>
              All customers
            </Link>
            {segments.map((segment) => (
              <Link
                key={segment.id}
                href={`/dashboard/customers?segment=${segment.id}`}
                aria-current={activeSegment?.id === segment.id ? "page" : undefined}
                className={`${pillBase} ${activeSegment?.id === segment.id ? pillActive : pillIdle}`}
                title={segment.description ?? undefined}
              >
                {segment.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col gap-0.5">
          <h2 className="dx-title">{activeSegment ? activeSegment.name : "All customers"}</h2>
          <p className="dx-subtitle">
            {activeSegment?.description ? `${activeSegment.description} · ` : ""}Sorted by lead score, then recent activity.
          </p>
        </div>

        <CustomerList customers={customers} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4 text-sm">
          <p className="flex items-center gap-2 text-ds-text-secondary">
            <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            AI qualification is a signal, not verified truth.
          </p>
          <p className="flex items-center gap-1 font-medium text-ds-primary">
            Select a customer to view their profile
            <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
          </p>
        </div>
      </Card>
    </div>
  );
}
