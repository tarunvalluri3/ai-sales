"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ImageIcon, Pencil } from "lucide-react";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteServiceAction as DeleteServiceAction } from "./actions";
import type { Service } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "name", label: "Service", width: "minmax(14rem,2fr)", sortable: true },
  { key: "price", label: "Price", width: "8.5rem" },
  { key: "actions", label: "Actions", width: "7rem" },
];

const EDIT_CLASS =
  "inline-flex size-9 items-center justify-center rounded-xl text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";

/**
 * Client half of the Services list: the shared sortable/paginated DataTable
 * (`../_components/data-table.tsx`) with a thumbnail, name, description,
 * price and edit / delete icon buttons per row. The page itself stays a
 * server component fetching data; this only owns sort/pagination chrome.
 */
export function ServicesList({
  services,
  canEdit,
  deleteServiceAction,
  onEdit,
}: {
  services: Service[];
  canEdit: boolean;
  deleteServiceAction: typeof DeleteServiceAction;
  /** When set, "Edit" calls this instead of navigating to /dashboard/services/[id]/edit -- used by the onboarding wizard to keep editing inline. */
  onEdit?: (id: string) => void;
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
          <TableCell className="min-w-0 gap-4">
            {service.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog photo from a business-supplied URL
              <img src={service.image_url} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-ds-surface-soft text-ds-text-faint">
                <ImageIcon className="size-5" strokeWidth={1.75} />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-ds-text-primary">{service.name}</span>
              {service.description ? (
                <span className="line-clamp-2 text-xs text-ds-text-secondary">{service.description}</span>
              ) : null}
            </span>
          </TableCell>
          <TableCell>
            {service.price ? <span className="text-sm font-medium text-ds-text-primary">${service.price}</span> : "—"}
          </TableCell>
          <TableCell className="gap-1">
            {canEdit ? (
              onEdit ? (
                <button type="button" onClick={() => onEdit(service.id)} aria-label={`Edit ${service.name}`} title="Edit" className={EDIT_CLASS}>
                  <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : (
                <Link href={`/dashboard/services/${service.id}/edit`} aria-label={`Edit ${service.name}`} title="Edit" className={EDIT_CLASS}>
                  <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </Link>
              )
            ) : null}
            <DeleteButton action={deleteServiceAction} id={service.id} canEdit={canEdit} variant="icon" label={`Delete ${service.name}`} />
          </TableCell>
        </TableRow>
      )}
    />
  );
}
