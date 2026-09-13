import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listCustomersForBusiness } from "@/lib/customers";
import { listSegmentsForBusiness, listCustomersInSegment } from "@/lib/segments";
import { CustomerList } from "./customer-list";
import { SegmentManager } from "./segment-manager";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const { businessId, orgRole } = await requireBusinessContext();
  const canManageSegments = hasMinRole(orgRole, "org:admin");
  const { segment: segmentId } = await searchParams;

  const segments = await listSegmentsForBusiness(businessId);
  const activeSegment = segmentId ? segments.find((segment) => segment.id === segmentId) : undefined;

  const customers = activeSegment
    ? await listCustomersInSegment(businessId, activeSegment)
    : await listCustomersForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ds-text-primary">Customers</h1>
        <p className="text-sm text-ds-text-muted">
          Every prospect who&apos;s shared contact info, aggregated across channels, with their lead score, tags, and activity in one place.
        </p>
      </div>

      <SegmentManager segments={segments} canManage={canManageSegments} />

      {segments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href="/dashboard/customers"
            className={`rounded-ds-sm px-2.5 py-1 text-xs font-medium transition-colors ${
              !activeSegment
                ? "bg-ds-accent text-ds-accent-on"
                : "bg-ds-surface-soft text-ds-text-secondary hover:text-ds-text-primary"
            }`}
          >
            All customers
          </Link>
          {segments.map((segment) => (
            <Link
              key={segment.id}
              href={`/dashboard/customers?segment=${segment.id}`}
              className={`rounded-ds-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                activeSegment?.id === segment.id
                  ? "bg-ds-accent text-ds-accent-on"
                  : "bg-ds-surface-soft text-ds-text-secondary hover:text-ds-text-primary"
              }`}
              title={segment.description ?? undefined}
            >
              {segment.name}
            </Link>
          ))}
        </div>
      ) : null}

      <CustomerList customers={customers} />
    </div>
  );
}
