"use client";

import { Fragment, type ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc";

export type SortState = { key: string; direction: SortDirection } | null;

export type DataTableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** A CSS grid track size for this column, e.g. "2fr", "140px", "minmax(160px,1fr)". Defaults to "1fr". */
  width?: string;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Generic, presentation-only "table" built on a single CSS Grid with ARIA
 * table roles (role="table"/"row"/"columnheader"/"cell") rather than a
 * literal <table> element -- lets a row be a whole-row <Link> (TableRow,
 * below) and hold richly-styled cells (badges, checkboxes, an expandable
 * detail region) while every column still stays perfectly aligned, since
 * header and body cells are all siblings of one grid rather than nested
 * per-row tables.
 *
 * Never owns filtering, fetching, or the sort comparator -- callers pass an
 * already-filtered `items` array and keep their own sort `useMemo`; this
 * component only renders sortable-column-header chrome (computing the next
 * {key, direction} on click, so that toggle logic isn't duplicated per
 * page) and client-side pagination over whatever was handed to it.
 */
export function DataTable<T>({
  items,
  columns,
  getRowId,
  renderRow,
  sort = null,
  onSortChange,
  pageSize = DEFAULT_PAGE_SIZE,
  emptyState,
  caption,
}: {
  items: T[];
  columns: DataTableColumn[];
  getRowId: (item: T) => string;
  /** May return more than one TableRow (e.g. a main row plus an expandable full-width detail row). */
  renderRow: (item: T) => ReactNode;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  pageSize?: number;
  emptyState?: ReactNode;
  caption: string;
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamped, not stored-and-reset: when a filter/tab change shrinks the
  // item count out from under the page the user was on, this naturally
  // falls back to the last valid page instead of showing an empty grid.
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  function handleHeaderClick(column: DataTableColumn) {
    if (!column.sortable || !onSortChange) return;
    const isCurrent = sort?.key === column.key;
    const nextDirection: SortDirection = isCurrent && sort!.direction === "asc" ? "desc" : "asc";
    onSortChange({ key: column.key, direction: nextDirection });
  }

  const gridTemplateColumns = columns.map((column) => column.width ?? "1fr").join(" ");

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-ds-lg border border-ds-border">
        {/* No min-w-max here: it forces min-width:max-content, which
            defeats the fr-based column sizing above and forces horizontal
            scroll even on a viewport wide enough for the grid to shrink to
            fit. overflow-x-auto alone still covers genuinely-too-narrow
            viewports. */}
        <div role="table" aria-label={caption} className="grid" style={{ gridTemplateColumns }}>
          <div role="row" className="contents">
            {columns.map((column) => {
              const isSortable = Boolean(column.sortable && onSortChange);
              const isCurrent = sort?.key === column.key;
              const ariaSort = isCurrent ? (sort!.direction === "asc" ? "ascending" : "descending") : isSortable ? "none" : undefined;
              const alignClass =
                column.align === "right" ? "justify-end text-right" : column.align === "center" ? "justify-center text-center" : "";

              return (
                <div
                  key={column.key}
                  role="columnheader"
                  aria-sort={ariaSort}
                  className={`flex items-center gap-1 border-b border-ds-border bg-ds-surface-soft px-3 py-2 text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase ${alignClass}`}
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(column)}
                      className="flex items-center gap-1 transition-colors hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      {column.label}
                      {isCurrent ? (
                        sort!.direction === "asc" ? (
                          <ChevronUp className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </div>
              );
            })}
          </div>

          {pageItems.length === 0 ? (
            <div role="row" className="contents">
              <div role="cell" className="col-span-full px-4 py-10 text-center text-sm text-ds-text-muted">
                {emptyState ?? "Nothing to show."}
              </div>
            </div>
          ) : (
            pageItems.map((item) => <Fragment key={getRowId(item)}>{renderRow(item)}</Fragment>)
          )}
        </div>
      </div>

      {items.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 px-1 text-xs text-ds-text-secondary">
          <span>
            {start + 1}–{Math.min(start + pageSize, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={currentPage === 0}
              aria-label="Previous page"
              className="flex size-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="px-1">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
              className="flex size-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A row's `display: contents` wrapper (role="row") so its cells become
 * direct grid children of the parent DataTable's single grid, keeping
 * column alignment automatic. Renders as a whole-row `<Link>` when given
 * `href` -- clicking/hovering anywhere in the row still works because
 * `display: contents` removes the anchor's own box from layout without
 * removing it from the DOM (event bubbling and `:hover`/`group-hover`
 * matching both still apply to its descendants).
 */
export function TableRow({
  href,
  onClick,
  className = "",
  children,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} role="row" className={`group contents ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <div role="row" onClick={onClick} className={`group contents ${className}`}>
      {children}
    </div>
  );
}

export function TableCell({
  children,
  className = "",
  align = "left",
  direction = "row",
  id,
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  /** "col" stacks content vertically (e.g. a name over a meta line) instead of the default single-line row. */
  direction?: "row" | "col";
  id?: string;
}) {
  const isCol = direction === "col";
  // Column direction: `align` controls which edge content hugs (align-items).
  // Row direction: `align` controls justify-content instead -- the two
  // layouts use different flex properties for "alignment," so they're kept
  // as separate branches rather than one shared class list.
  const crossAxisClass = isCol
    ? align === "right"
      ? "items-end text-right"
      : align === "center"
        ? "items-center text-center"
        : "items-start text-left"
    : "items-center";
  const mainAxisClass = !isCol
    ? align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : ""
    : "";
  return (
    <div
      id={id}
      role="cell"
      className={`flex min-w-0 gap-2 border-b border-ds-border px-3 py-3 text-sm text-ds-text-primary transition-colors group-hover:bg-ds-surface-elevated ${isCol ? "flex-col" : ""} ${crossAxisClass} ${mainAxisClass} ${className}`}
    >
      {children}
    </div>
  );
}
