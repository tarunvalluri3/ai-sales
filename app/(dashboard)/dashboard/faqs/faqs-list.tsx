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
export type FaqReadinessStatus = "ready" | "processing" | "too_short";

export function FaqsList({
  faqs,
  canEdit,
  deleteFaqAction,
  onEdit,
  readinessByFaqId,
}: {
  faqs: Faq[];
  canEdit: boolean;
  deleteFaqAction: typeof DeleteFaqAction;
  /** When set, "Edit" calls this instead of navigating to /dashboard/faqs/[id]/edit -- used by the onboarding wizard to keep editing inline. */
  onEdit?: (id: string) => void;
  /**
   * When set, shows a small status badge per row -- used by the onboarding
   * wizard, where a just-added FAQ isn't retrieval-ready until its
   * generated document finishes embedding. "processing" (still embedding,
   * resolves on its own) and "too_short" (question/answer below the
   * readiness minimum, never resolves without editing) are kept distinct
   * -- both used to render as one misleading "Processing" badge that a
   * too-short FAQ would show forever, with the wizard's poll loop spinning
   * on a condition that could never clear (2026-10-29 bugfix, STATE.md).
   */
  readinessByFaqId?: Record<string, FaqReadinessStatus>;
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
      renderRow={(faq) => {
        const status = readinessByFaqId?.[faq.id];
        return (
          <TableRow>
            <TableCell direction="col" className="gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ds-text-primary">{faq.question}</span>
                {status ? (
                  <span
                    className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide-ds ${
                      status === "ready"
                        ? "bg-ds-success-bg text-ds-success"
                        : status === "too_short"
                          ? "bg-ds-warning-bg text-ds-warning"
                          : "bg-ds-surface-elevated text-ds-text-muted"
                    }`}
                  >
                    {status === "ready" ? "Ready" : status === "too_short" ? "Needs more detail" : "Processing"}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <span className="line-clamp-2 text-sm text-ds-text-secondary">{faq.answer}</span>
            </TableCell>
            <TableCell align="right">
              <div className="flex items-center justify-end gap-3">
                {canEdit ? (
                  onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(faq.id)}
                      className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      Edit
                    </button>
                  ) : (
                    <Link
                      href={`/dashboard/faqs/${faq.id}/edit`}
                      className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      Edit
                    </Link>
                  )
                ) : null}
                <DeleteButton action={deleteFaqAction} id={faq.id} canEdit={canEdit} />
              </div>
            </TableCell>
          </TableRow>
        );
      }}
    />
  );
}
