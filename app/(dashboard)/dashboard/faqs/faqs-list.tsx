"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteFaqAction as DeleteFaqAction } from "./actions";
import type { Faq } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "question", label: "Question", width: "2fr", sortable: true },
  { key: "answer", label: "Answer", width: "2fr" },
  { key: "actions", label: "Actions", width: "160px", align: "right" },
];

/** Client half of the FAQs list -- same DataTable retrofit as ProductsList/ServicesList (codebase gap sweep, Phase E). */
export function FaqsList({
  faqs,
  canEdit,
  deleteFaqAction,
}: {
  faqs: Faq[];
  canEdit: boolean;
  deleteFaqAction: typeof DeleteFaqAction;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedFaqs = useMemo(() => {
    if (!sort) return faqs;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...faqs].sort((a, b) => direction * a.question.localeCompare(b.question));
  }, [faqs, sort]);

  return (
    <DataTable
      items={sortedFaqs}
      columns={COLUMNS}
      getRowId={(faq) => faq.id}
      sort={sort}
      onSortChange={setSort}
      caption="FAQs"
      renderRow={(faq) => (
        <TableRow>
          <TableCell direction="col" className="gap-0.5">
            <span className="font-medium text-ds-text-primary">{faq.question}</span>
          </TableCell>
          <TableCell>
            <span className="line-clamp-2 text-sm text-ds-text-secondary">{faq.answer}</span>
          </TableCell>
          <TableCell align="right">
            <div className="flex items-center justify-end gap-3">
              {canEdit ? (
                <Link
                  href={`/dashboard/faqs/${faq.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
              ) : null}
              <DeleteButton action={deleteFaqAction} id={faq.id} canEdit={canEdit} />
            </div>
          </TableCell>
        </TableRow>
      )}
    />
  );
}
