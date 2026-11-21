"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { DeleteButton } from "../../_components/delete-button";
import { EmptyState } from "../../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn } from "../../_components/data-table";
import { IngestionStatusPill, IngestionErrorMessage } from "./ingestion-status-pill";
import { RetryIngestionButton } from "./retry-ingestion-button";
import { PublishToggleButton } from "./publish-toggle-button";
import { RefreshUrlButton } from "./refresh-url-button";
import { ExtractNowButton } from "./extract-now-button";
import { RowActionsMenu } from "./row-actions-menu";
import {
  deleteKnowledgeDocumentAction,
  retryIngestionAction,
  publishKnowledgeDocumentAction,
  unpublishKnowledgeDocumentAction,
  bulkPublishKnowledgeDocumentsAction,
  bulkDeleteKnowledgeDocumentsAction,
  type BulkActionState,
} from "../actions";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  file: "File",
  url: "URL",
  product: "Product",
  service: "Service",
  faq: "FAQ",
};

type StatusFilter = "all" | "published" | "draft" | "failed";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Approved" },
  { id: "draft", label: "Draft" },
  { id: "failed", label: "Needs attention" },
];

const bulkInitialState: BulkActionState = {};

/**
 * Owns the knowledge list's search, status filter, and multi-select bulk
 * actions (2026-09-08 optimize pass, following `/impeccable critique`'s
 * "no search/filter/bulk actions as the list grows" -- already flagged
 * once as a deliberately-deferred backlog item, un-deferred this round).
 * `documents` is the full, server-fetched list; filtering happens
 * entirely client-side against data already on the page, no new fetch.
 *
 * Row rendering itself (primary action selection, overflow menu) is the
 * same logic that used to live directly in `page.tsx`, moved here
 * because a checkbox column, live-state accent border, and multi-select
 * state all need to live at the same level as the rows they touch.
 */
export function KnowledgeList({
  documents,
  canEdit,
  agentPublished,
  stacked = false,
  onEdit,
}: {
  documents: KnowledgeDocument[];
  agentPublished: boolean;
  stacked?: boolean;
  canEdit: boolean;
  /** When set, "Edit" calls this instead of navigating to /dashboard/knowledge/[id]/edit -- used by the onboarding wizard to keep editing inline. */
  onEdit?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirming, setBulkDeleteConfirming] = useState(false);
  const [bulkPublishState, bulkPublishFormAction, isBulkPublishing] = useActionState(
    bulkPublishKnowledgeDocumentsAction,
    bulkInitialState,
  );
  const [bulkDeleteState, bulkDeleteFormAction, isBulkDeleting] = useActionState(
    bulkDeleteKnowledgeDocumentsAction,
    bulkInitialState,
  );

  const liveCount = useMemo(
    () => documents.filter((d) => d.status === "published" && d.ingestion_status === "complete").length,
    [documents],
  );
  const attentionCount = useMemo(() => documents.filter((d) => d.ingestion_status === "failed").length, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (statusFilter === "published" && document.status !== "published") return false;
      if (statusFilter === "draft" && document.status !== "draft") return false;
      if (statusFilter === "failed" && document.ingestion_status !== "failed") return false;
      if (q && !document.title.toLowerCase().includes(q) && !document.content.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [documents, query, statusFilter]);

  function handleFilterKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = STATUS_FILTERS.findIndex((f) => f.id === statusFilter);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = STATUS_FILTERS[(currentIndex + delta + STATUS_FILTERS.length) % STATUS_FILTERS.length];
    setStatusFilter(next.id);
    document.getElementById(`knowledge-filter-${next.id}`)?.focus();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const visibleIds = filtered.map((d) => d.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  const selectedCount = selectedIds.size;

  const columns = useMemo<DataTableColumn[]>(() => {
    const base: DataTableColumn[] = [
      { key: "document", label: "Document", width: "minmax(16rem,2.4fr)" },
      { key: "source", label: "Source", width: "6.5rem" },
      { key: "actions", label: "Actions", width: "11rem" },
    ];
    return canEdit ? [{ key: "select", label: "", width: "3.25rem" }, ...base] : base;
  }, [canEdit]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ds-text-primary">
        {liveCount} documents ready · {documents.filter((document) => document.status === "draft").length} waiting for review
        {attentionCount > 0 ? ` · ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : ""}
      </p>

      {documents.length === 0 ? (
        <EmptyState
          title="No knowledge documents yet"
          description="Add your first document below so your AI sales employee has approved knowledge to draw from."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or content…"
                aria-label="Search knowledge documents"
                className="h-10 w-full rounded-xl border border-ds-border-strong bg-ds-surface pr-4 pl-12 text-sm text-ds-text-primary placeholder:text-ds-text-faint"
              />
            </div>
            <div role="tablist" aria-label="Filter by status" onKeyDown={handleFilterKeyDown} className="dx-tabs">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  id={`knowledge-filter-${f.id}`}
                  aria-selected={statusFilter === f.id}
                  aria-controls="knowledge-list-panel"
                  tabIndex={statusFilter === f.id ? 0 : -1}
                  onClick={() => setStatusFilter(f.id)}
                  className="dx-tab px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                >
                  {f.label}
                  <span className="tabular-nums">
                    {f.id === "all"
                      ? documents.length
                      : f.id === "failed"
                        ? attentionCount
                        : documents.filter((d) => d.status === f.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {canEdit && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
              <label className="flex items-center gap-3 text-sm text-ds-text-primary">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="size-5 rounded accent-ds-accent"
                />
                Select all ({filtered.length})
              </label>
              {selectedCount > 0 ? (
                <>
                  <span className="dx-pill bg-ds-primary/10 px-3 py-1 text-xs font-medium text-ds-primary">{selectedCount} selected</span>
                  <form action={bulkPublishFormAction} className="flex items-center gap-2">
                    {[...selectedIds].map((id) => (
                      <input key={id} type="hidden" name="ids" value={id} />
                    ))}
                    <button
                      type="submit"
                      disabled={isBulkPublishing}
                      className="ds-btn-label inline-flex h-9 items-center rounded-xl border border-ds-primary bg-ds-surface px-4 text-sm text-ds-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                    >
                      {isBulkPublishing ? "Approving…" : "Approve selected"}
                    </button>
                  </form>
                  {bulkDeleteConfirming ? (
                    <form action={bulkDeleteFormAction} className="flex items-center gap-2">
                      {[...selectedIds].map((id) => (
                        <input key={id} type="hidden" name="ids" value={id} />
                      ))}
                      <span className="text-xs text-ds-text-secondary">Delete {selectedCount} document{selectedCount === 1 ? "" : "s"}?</span>
                      <button
                        type="submit"
                        disabled={isBulkDeleting}
                        autoFocus
                        className="inline-flex h-9 items-center rounded-xl bg-ds-danger px-3 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
                      >
                        {isBulkDeleting ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkDeleteConfirming(false)}
                        disabled={isBulkDeleting}
                        className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteConfirming(true)}
                      className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                    >
                      Delete selected
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                  >
                    Clear selection
                  </button>
                </>
              ) : null}
              {bulkPublishState.error ? (
                <span role="alert" className="text-xs text-ds-danger">
                  {bulkPublishState.error}
                </span>
              ) : bulkPublishState.success ? (
                <span className="text-xs text-ds-success">
                  Approved {bulkPublishState.count} document{bulkPublishState.count === 1 ? "" : "s"}.
                </span>
              ) : null}
              {bulkDeleteState.error ? (
                <span role="alert" className="text-xs text-ds-danger">
                  {bulkDeleteState.error}
                </span>
              ) : bulkDeleteState.success ? (
                <span className="text-xs text-ds-success">
                  Deleted {bulkDeleteState.count} document{bulkDeleteState.count === 1 ? "" : "s"}.
                </span>
              ) : null}
            </div>
          ) : null}

          <div id="knowledge-list-panel" role="tabpanel" aria-labelledby={`knowledge-filter-${statusFilter}`}>
            {filtered.length === 0 ? (
              <EmptyState
                title="No documents match"
                description="Try a different search term or clear the status filter."
              />
            ) : stacked ? (
              <ul className="flex min-w-0 flex-col gap-3">
                {filtered.map((document) => (
                  <KnowledgeRow key={document.id} document={document} canEdit={canEdit}
                    agentPublished={agentPublished} stacked selected={selectedIds.has(document.id)}
                    onToggleSelected={() => toggleSelected(document.id)} onEdit={onEdit} />
                ))}
              </ul>
            ) : (
              <DataTable
                items={filtered}
                columns={columns}
                getRowId={(document) => document.id}
                caption="Knowledge documents"
                renderRow={(document) => (
                  <KnowledgeRow
                    document={document}
                    canEdit={canEdit}
                    agentPublished={agentPublished}
                    selected={selectedIds.has(document.id)}
                    onToggleSelected={() => toggleSelected(document.id)}
                    onEdit={onEdit}
                  />
                )}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KnowledgeRow({
  document,
  canEdit,
  agentPublished,
  stacked = false,
  selected,
  onToggleSelected,
  onEdit,
}: {
  document: KnowledgeDocument;
  agentPublished: boolean;
  stacked?: boolean;
  canEdit: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit?: (id: string) => void;
}) {
  // 2026-09-08 distill pass: exactly one primary action per row (a solid
  // accent button) plus a single overflow menu for everything else. A
  // failed document takes priority for the primary slot over Publish --
  // fixing broken ingestion matters more than publishing content the AI
  // can't actually use yet.
  const isFailed = document.ingestion_status === "failed";
  const isDraft = document.status === "draft";
  const isPublished = document.status === "published";
  const isLive = isPublished && document.ingestion_status === "complete";
  const primaryIsRetry = isFailed;
  const primaryIsPublish = !isFailed && isDraft;
  const primaryIsEdit = !isFailed && isPublished;

  const Row = stacked ? "li" : TableRow;
  const Cell = stacked ? "div" : TableCell;
  return (
    <Row className={stacked ? "flex min-w-0 flex-wrap items-start gap-2 border border-ds-border p-3" : undefined}>
      {canEdit ? (
        <Cell>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${document.title}`}
            className="size-5 shrink-0 rounded accent-ds-accent"
          />
        </Cell>
      ) : null}
      <Cell className={`min-w-0 items-start gap-3.5 ${stacked ? "flex flex-1 basis-36" : ""} ${selected ? "bg-ds-lime-soft/60" : ""}`}>
        <FileText className="mt-0.5 size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm font-medium text-ds-text-primary">{document.title}</span>
          {isLive ? (
            <span
              title="Approved and processed: goes live with your next Publish changes"
              className="flex items-center gap-1.5 text-sm font-medium text-ds-success"
            >
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ds-success-bright" />
              {agentPublished ? "Live" : "Ready"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IngestionStatusPill status={document.ingestion_status} />
          <span className={`dx-pill px-2.5 py-0.5 text-xs font-medium ${isPublished ? "bg-ds-warning-bg text-ds-warning" : "bg-ds-surface-soft text-ds-text-secondary"}`}>
            {isPublished ? "Approved" : "Draft"}
          </span>
        </div>
        <span className={`${stacked ? "line-clamp-1 break-words" : "line-clamp-2"} text-sm text-ds-text-secondary`}>{document.content}</span>
        {isFailed ? <IngestionErrorMessage lastError={document.ingestion_last_error} /> : null}
        {!stacked && document.source_type === "url" && document.source_url ? (
          <span className="truncate text-sm text-ds-text-secondary">
            {document.source_url}
            {document.refresh_interval_hours ? ` · Auto-refreshes every ${document.refresh_interval_hours}h` : ""}
          </span>
        ) : null}
        </div>
      </Cell>
      {!stacked ? <Cell>
        <span className="text-sm text-ds-text-primary">{SOURCE_LABEL[document.source_type] ?? document.source_type}</span>
      </Cell> : null}
      <Cell>
        <div className={`flex items-center gap-2 ${stacked ? "flex-wrap" : "shrink-0"}`}>
        {primaryIsRetry ? (
          <RetryIngestionButton action={retryIngestionAction} id={document.id} canEdit={canEdit} />
        ) : primaryIsPublish ? (
          <PublishToggleButton
            action={publishKnowledgeDocumentAction}
            id={document.id}
            label="Approve"
            pendingLabel="Approving…"
            canEdit={canEdit}
            variant="primary"
          />
        ) : primaryIsEdit && canEdit ? (
          onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(document.id)}
              className="ds-btn-label inline-flex h-9 items-center rounded-xl border border-ds-primary bg-ds-surface px-4 text-sm text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              Edit
            </button>
          ) : (
            <Link
              href={`/dashboard/knowledge/${document.id}/edit`}
              className="ds-btn-label inline-flex h-9 items-center rounded-xl border border-ds-primary bg-ds-surface px-4 text-sm text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              Edit
            </Link>
          )
        ) : null}
        <RowActionsMenu label={`More actions for ${document.title}`}>
          {!primaryIsEdit && canEdit ? (
            onEdit ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => onEdit(document.id)}
                className="block w-full rounded-none px-4 py-2.5 text-left text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft"
              >
                Edit
              </button>
            ) : (
              <Link
                href={`/dashboard/knowledge/${document.id}/edit`}
                role="menuitem"
                className="block w-full rounded-none px-4 py-2.5 text-left text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft"
              >
                Edit
              </Link>
            )
          ) : null}
          {/*
            2026-09-08 harden pass, from the second critique: Publish used
            to be reachable here even when a draft document's ingestion
            had failed -- publishing content the pipeline never
            successfully chunked/embedded would make it "published" with
            zero retrievable content, silently. Retry (the row's primary
            action whenever isFailed) is the only correct next step until
            ingestion succeeds; Publish simply isn't offered here anymore
            while failed.
          */}
          {isPublished ? (
            <PublishToggleButton
              action={unpublishKnowledgeDocumentAction}
              id={document.id}
              label="Unapprove"
              pendingLabel="Unapproving…"
              canEdit={canEdit}
              confirmMessage="This moves the document back to draft. Customers keep seeing it until you publish."
              variant="menuitem"
            />
          ) : null}
          {document.source_type === "url" ? <RefreshUrlButton id={document.id} canEdit={canEdit} /> : null}
          {isPublished && !document.onboarding_website_import ? <ExtractNowButton id={document.id} canEdit={canEdit} /> : null}
          <DeleteButton
            action={deleteKnowledgeDocumentAction}
            id={document.id}
            canEdit={canEdit}
            variant="menuitem"
            confirmMessage={
              isPublished
                ? "Customers keep seeing this until you publish the deletion. Delete anyway?"
                : "Delete this document?"
            }
          />
        </RowActionsMenu>
        </div>
      </Cell>
    </Row>
  );
}
