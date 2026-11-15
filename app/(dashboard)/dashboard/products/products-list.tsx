"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ImageIcon, Pencil } from "lucide-react";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteProductAction as DeleteProductAction } from "./actions";
import type { Product } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "name", label: "Product", width: "minmax(14rem,2fr)", sortable: true },
  { key: "price", label: "Price", width: "8.5rem" },
  { key: "actions", label: "Actions", width: "7rem" },
];

const EDIT_CLASS =
  "inline-flex size-9 items-center justify-center rounded-xl text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";

/**
 * Client half of the Products list: the shared sortable/paginated DataTable
 * (`../_components/data-table.tsx`) with a thumbnail, name, description,
 * price and edit / delete icon buttons per row. The page itself stays a
 * server component fetching data; this only owns sort/pagination chrome.
 */
export function ProductsList({
  products,
  canEdit,
  deleteProductAction,
  onEdit,
}: {
  products: Product[];
  canEdit: boolean;
  deleteProductAction: typeof DeleteProductAction;
  /** When set, "Edit" calls this instead of navigating to /dashboard/products/[id]/edit -- used by the onboarding wizard to keep editing inline. */
  onEdit?: (id: string) => void;
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
          <TableCell className="min-w-0 gap-4">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog photo from a business-supplied URL
              <img src={product.image_url} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-ds-surface-soft text-ds-text-faint">
                <ImageIcon className="size-5" strokeWidth={1.75} />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-ds-text-primary">{product.name}</span>
              {product.description ? (
                <span className="line-clamp-2 text-xs text-ds-text-secondary">{product.description}</span>
              ) : null}
            </span>
          </TableCell>
          <TableCell>
            {product.price ? <span className="text-sm font-medium text-ds-text-primary">${product.price}</span> : "—"}
          </TableCell>
          <TableCell className="gap-1">
            {canEdit ? (
              onEdit ? (
                <button type="button" onClick={() => onEdit(product.id)} aria-label={`Edit ${product.name}`} title="Edit" className={EDIT_CLASS}>
                  <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : (
                <Link href={`/dashboard/products/${product.id}/edit`} aria-label={`Edit ${product.name}`} title="Edit" className={EDIT_CLASS}>
                  <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </Link>
              )
            ) : null}
            <DeleteButton action={deleteProductAction} id={product.id} canEdit={canEdit} variant="icon" label={`Delete ${product.name}`} />
          </TableCell>
        </TableRow>
      )}
    />
  );
}
