"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { DeleteButton } from "../_components/delete-button";
import type { deleteFaqAction as DeleteFaqAction } from "./actions";
import type { Faq } from "@/lib/supabase/types";

const COLUMNS: DataTableColumn[] = [
  { key: "question", label: "Question", width: "minmax(12rem,1.4fr)", sortable: true },
  { key: "answer", label: "Answer", width: "minmax(12rem,1.6fr)" },
  { key: "actions", label: "Actions", width: "7rem" },
];

const EDIT_CLASS =
  "inline-flex size-9 items-center justify-center rounded-xl text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";

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
            <TableCell direction="col" className="gap-1.5">
              <span className="text-sm leading-snug font-medium text-ds-text-primary">{faq.question}</span>
              {status ? (
                <span
                  className={`dx-pill shrink-0 px-2.5 py-0.5 text-xs font-medium ${
                    status === "ready"
                      ? "bg-ds-lime-soft text-ds-primary"
                      : status === "too_short"
                        ? "bg-ds-warning-bg text-ds-warning"
                        : "bg-ds-surface-soft text-ds-text-secondary"
                  }`}
                >
                  {status === "ready" ? "Ready" : status === "too_short" ? "Needs more detail" : "Processing"}
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <span className="line-clamp-3 text-sm leading-relaxed text-ds-text-primary">{faq.answer}</span>
            </TableCell>
            <TableCell className="gap-1">
              {canEdit ? (
                onEdit ? (
                  <button type="button" onClick={() => onEdit(faq.id)} aria-label="Edit FAQ" title="Edit" className={EDIT_CLASS}>
                    <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : (
                  <Link href={`/dashboard/faqs/${faq.id}/edit`} aria-label="Edit FAQ" title="Edit" className={EDIT_CLASS}>
                    <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                )
              ) : null}
              <DeleteButton action={deleteFaqAction} id={faq.id} canEdit={canEdit} variant="icon" label="Delete FAQ" />
            </TableCell>
          </TableRow>
        );
      }}
    />
  );
}
