"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteServiceAction as DeleteServiceAction } from "./actions";
import type { Service } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "name", label: "Service", width: "2fr", sortable: true },
  { key: "price", label: "Price", width: "120px", align: "right" },
  { key: "actions", label: "Actions", width: "160px", align: "right" },
];

/** Client half of the Services list -- same DataTable retrofit as ProductsList (codebase gap sweep, Phase E). */
export function ServicesList({
  services,
  canEdit,
  deleteServiceAction,
}: {
  services: Service[];
  canEdit: boolean;
  deleteServiceAction: typeof DeleteServiceAction;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedServices = useMemo(() => {
    if (!sort) return services;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...services].sort((a, b) => direction * a.name.localeCompare(b.name));
  }, [services, sort]);

  return (
    <DataTable
      items={sortedServices}
      columns={COLUMNS}
      getRowId={(service) => service.id}
      sort={sort}
      onSortChange={setSort}
      caption="Services"
      renderRow={(service) => (
        <TableRow>
          <TableCell direction="col" className="gap-0.5">
            <span className="font-medium text-ds-text-primary">{service.name}</span>
            {service.description ? (
              <span className="line-clamp-2 text-xs text-ds-text-muted">{service.description}</span>
            ) : null}
          </TableCell>
          <TableCell align="right">
            {service.price ? <span className="font-semibold text-ds-accent">${service.price}</span> : "—"}
          </TableCell>
          <TableCell align="right">
            <div className="flex items-center justify-end gap-3">
              {canEdit ? (
                <Link
                  href={`/dashboard/services/${service.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
              ) : null}
              <DeleteButton action={deleteServiceAction} id={service.id} canEdit={canEdit} />
            </div>
          </TableCell>
        </TableRow>
      )}
    />
  );
}
