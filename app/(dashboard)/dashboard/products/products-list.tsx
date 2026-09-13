"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteProductAction as DeleteProductAction } from "./actions";
import type { Product } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "name", label: "Product", width: "2fr", sortable: true },
  { key: "price", label: "Price", width: "120px", align: "right" },
  { key: "actions", label: "Actions", width: "160px", align: "right" },
];

/**
 * Client half of the Products list -- part of the codebase gap sweep's
 * Phase E, replacing the former plain `<ul><li>` card list with the
 * shared sortable/paginated DataTable already used by Leads/Appointments
 * (`../_components/data-table.tsx`). The page itself stays a server
 * component fetching data; this only owns sort/pagination chrome, same
 * server-fetches/client-renders split as AppointmentsTable/LeadsList.
 */
export function ProductsList({
  products,
  canEdit,
  deleteProductAction,
}: {
  products: Product[];
  canEdit: boolean;
  deleteProductAction: typeof DeleteProductAction;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedProducts = useMemo(() => {
    if (!sort) return products;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...products].sort((a, b) => direction * a.name.localeCompare(b.name));
  }, [products, sort]);

  return (
    <DataTable
      items={sortedProducts}
      columns={COLUMNS}
      getRowId={(product) => product.id}
      sort={sort}
      onSortChange={setSort}
      caption="Products"
      renderRow={(product) => (
        <TableRow>
          <TableCell direction="col" className="gap-0.5">
            <span className="font-medium text-ds-text-primary">{product.name}</span>
            {product.description ? (
              <span className="line-clamp-2 text-xs text-ds-text-muted">{product.description}</span>
            ) : null}
          </TableCell>
          <TableCell align="right">
            {product.price ? <span className="font-semibold text-ds-accent">${product.price}</span> : "—"}
          </TableCell>
          <TableCell align="right">
            <div className="flex items-center justify-end gap-3">
              {canEdit ? (
                <Link
                  href={`/dashboard/products/${product.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
              ) : null}
              <DeleteButton action={deleteProductAction} id={product.id} canEdit={canEdit} />
            </div>
          </TableCell>
        </TableRow>
      )}
    />
  );
}
