"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { DeleteButton } from "../../_components/delete-button";
import { EmptyState } from "../../_components/state-views";
import { Badge } from "../../_components/badge";
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
  { id: "published", label: "Published" },
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
export function KnowledgeList({ documents, canEdit }: { documents: KnowledgeDocument[]; canEdit: boolean }) {
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
      { key: "document", label: "Document", width: "2.4fr" },
      { key: "source", label: "Source", width: "100px" },
      { key: "actions", label: "Actions", width: "170px", align: "right" },
    ];
    return canEdit ? [{ key: "select", label: "", width: "36px" }, ...base] : base;
  }, [canEdit]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ds-text-secondary">
        {liveCount} live and answering prospects · {documents.length - liveCount} not live
        {attentionCount > 0 ? ` · ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : ""}
      </p>

      {documents.length === 0 ? (
        <EmptyState
          title="No knowledge documents yet"
          description="Add your first document below so your AI sales employee has approved knowledge to draw from."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or content…"
              aria-label="Search knowledge documents"
              className="w-full max-w-xs rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none"
            />
            <div
              role="tablist"
              aria-label="Filter by status"
              onKeyDown={handleFilterKeyDown}
              className="inline-flex flex-wrap items-center gap-1 rounded-ds-lg border border-ds-border bg-ds-surface p-1"
            >
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
                  className={`rounded-ds-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                    statusFilter === f.id
                      ? "bg-dashboard-primary text-dashboard-on-primary"
                      : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {canEdit && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-surface-soft px-3 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-ds-text-secondary">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="h-4 w-4 rounded-ds-sm border-ds-border accent-ds-accent"
                />
                Select all ({filtered.length})
              </label>
              {selectedCount > 0 ? (
                <>
                  <span className="text-xs text-ds-text-muted">{selectedCount} selected</span>
                  <form action={bulkPublishFormAction} className="flex items-center gap-2">
                    {[...selectedIds].map((id) => (
                      <input key={id} type="hidden" name="ids" value={id} />
                    ))}
                    <button
                      type="submit"
                      disabled={isBulkPublishing}
                      className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      {isBulkPublishing ? "Publishing…" : "Publish selected"}
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
                        className="rounded-ds-sm bg-ds-danger px-3 py-1.5 text-xs font-semibold text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
                      >
                        {isBulkDeleting ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkDeleteConfirming(false)}
                        disabled={isBulkDeleting}
                        className="rounded-ds-sm px-3 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteConfirming(true)}
                      className="rounded-ds-sm px-3 py-1.5 text-xs font-semibold text-ds-danger transition-colors hover:bg-ds-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                    >
                      Delete selected
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs font-medium text-ds-text-muted transition-colors hover:text-ds-text-secondary"
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
                  Published {bulkPublishState.count} document{bulkPublishState.count === 1 ? "" : "s"}.
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
                    selected={selectedIds.has(document.id)}
                    onToggleSelected={() => toggleSelected(document.id)}
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
  selected,
  onToggleSelected,
}: {
  document: KnowledgeDocument;
  canEdit: boolean;
  selected: boolean;
  onToggleSelected: () => void;
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

  return (
    <TableRow>
      {canEdit ? (
        <TableCell>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${document.title}`}
            className="h-4 w-4 shrink-0 rounded-ds-sm border-ds-border accent-ds-accent"
          />
        </TableCell>
      ) : null}
      <TableCell direction="col" className="gap-1">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span
              title="Live: published and answering prospects"
              aria-label="Live: published and answering prospects"
              className="h-2 w-2 shrink-0 rounded-full bg-ds-success"
            />
          ) : null}
          <span className="truncate font-medium text-ds-text-primary">{document.title}</span>
          <IngestionStatusPill status={document.ingestion_status} />
          <Badge tone={isPublished ? "success" : "muted"} size="sm">
            {document.status}
          </Badge>
        </div>
        <span className="line-clamp-2 text-sm text-ds-text-secondary">{document.content}</span>
        {isFailed ? <IngestionErrorMessage lastError={document.ingestion_last_error} /> : null}
        {document.source_type === "url" && document.source_url ? (
          <span className="truncate text-xs text-ds-text-muted">
            {document.source_url}
            {document.refresh_interval_hours ? ` · Auto-refreshes every ${document.refresh_interval_hours}h` : ""}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
          {SOURCE_LABEL[document.source_type] ?? document.source_type}
        </span>
      </TableCell>
      <TableCell align="right">
        <div className="flex shrink-0 items-center gap-2">
        {primaryIsRetry ? (
          <RetryIngestionButton action={retryIngestionAction} id={document.id} canEdit={canEdit} />
        ) : primaryIsPublish ? (
          <PublishToggleButton
            action={publishKnowledgeDocumentAction}
            id={document.id}
            label="Publish"
            pendingLabel="Publishing…"
            canEdit={canEdit}
            variant="primary"
          />
        ) : primaryIsEdit && canEdit ? (
          <Link
            href={`/dashboard/knowledge/${document.id}/edit`}
            className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Edit
          </Link>
        ) : null}
        <RowActionsMenu label={`More actions for ${document.title}`}>
          {!primaryIsEdit && canEdit ? (
            <Link
              href={`/dashboard/knowledge/${document.id}/edit`}
              role="menuitem"
              className="block w-full px-3.5 py-2 text-left text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft"
            >
              Edit
            </Link>
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
              label="Unpublish"
              pendingLabel="Unpublishing…"
              canEdit={canEdit}
              confirmMessage="Your AI will stop using this document immediately."
              variant="menuitem"
            />
          ) : null}
          {document.source_type === "url" ? <RefreshUrlButton id={document.id} canEdit={canEdit} /> : null}
          {isPublished ? <ExtractNowButton id={document.id} canEdit={canEdit} /> : null}
          <DeleteButton
            action={deleteKnowledgeDocumentAction}
            id={document.id}
            canEdit={canEdit}
            variant="menuitem"
            confirmMessage={
              isPublished ? "Your AI is using this in live conversations. Delete anyway?" : "Delete this document?"
            }
          />
        </RowActionsMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
