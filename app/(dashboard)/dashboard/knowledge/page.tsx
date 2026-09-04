import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { DeleteButton } from "../_components/delete-button";
import { KnowledgeForm } from "./knowledge-form";
import { IngestionStatusPill } from "./_components/ingestion-status-pill";
import { RetryIngestionButton } from "./_components/retry-ingestion-button";
import { PublishToggleButton } from "./_components/publish-toggle-button";
import { FileUploadForm } from "./_components/file-upload-form";
import { UrlImportForm } from "./_components/url-import-form";
import { RefreshUrlButton } from "./_components/refresh-url-button";
import { ExtractNowButton } from "./_components/extract-now-button";
import { EmptyState, PermissionNotice } from "../_components/state-views";
import {
  createKnowledgeDocumentAction,
  deleteKnowledgeDocumentAction,
  retryIngestionAction,
  publishKnowledgeDocumentAction,
  unpublishKnowledgeDocumentAction,
} from "./actions";

/**
 * Extends the default Server Action timeout for every action invoked from
 * this page -- per Next.js's documented behavior, `maxDuration` set at the
 * page level applies to its Server Actions (Server Actions have no other
 * way to get more than the platform default). Needed for
 * `createUrlKnowledgeDocumentAction`/`refreshUrlKnowledgeDocumentAction`
 * (`./actions.ts`), which can now fall back to a real headless-browser
 * render (lib/browser-render.ts) for JS-rendered sites -- same value as
 * `/api/chat`'s existing `maxDuration`.
 */
export const maxDuration = 60;

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  file: "File",
  url: "URL",
  product: "Product",
  service: "Service",
  faq: "FAQ",
};

export default async function KnowledgePage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const documents = await listKnowledgeDocumentsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Knowledge</h1>
        <p className="text-sm text-ds-text-secondary">
          This is what your AI sales employee is allowed to know. New documents start as drafts —
          publish one to make it part of your AI&rsquo;s live reference context.
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No knowledge documents yet"
          description="Add your first document below so your AI sales employee has approved knowledge to draw from."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="group flex items-center justify-between gap-4 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-ds-text-primary">{document.title}</p>
                  <IngestionStatusPill status={document.ingestion_status} lastError={document.ingestion_last_error} />
                  <span
                    className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase ${
                      document.status === "published"
                        ? "bg-ds-success-bg text-ds-success"
                        : "bg-ds-surface-soft text-ds-text-muted"
                    }`}
                  >
                    {document.status}
                  </span>
                  <span className="rounded-ds-sm bg-ds-surface-soft px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase text-ds-text-muted">
                    {SOURCE_LABEL[document.source_type] ?? document.source_type}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-ds-text-secondary">{document.content}</p>
                {document.source_type === "url" && document.source_url ? (
                  <p className="truncate text-xs text-ds-text-muted">
                    {document.source_url}
                    {document.refresh_interval_hours
                      ? ` · Auto-refreshes every ${document.refresh_interval_hours}h`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {document.ingestion_status === "failed" ? (
                  <RetryIngestionButton action={retryIngestionAction} id={document.id} canEdit={canEdit} />
                ) : null}
                {document.source_type === "url" ? <RefreshUrlButton id={document.id} canEdit={canEdit} /> : null}
                {document.status === "published" ? <ExtractNowButton id={document.id} canEdit={canEdit} /> : null}
                {document.status === "draft" ? (
                  <PublishToggleButton
                    action={publishKnowledgeDocumentAction}
                    id={document.id}
                    label="Publish"
                    pendingLabel="Publishing…"
                    canEdit={canEdit}
                  />
                ) : (
                  <PublishToggleButton
                    action={unpublishKnowledgeDocumentAction}
                    id={document.id}
                    label="Unpublish"
                    pendingLabel="Unpublishing…"
                    canEdit={canEdit}
                  />
                )}
                {canEdit ? (
                  <Link
                    href={`/dashboard/knowledge/${document.id}/edit`}
                    className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    Edit
                  </Link>
                ) : null}
                <DeleteButton action={deleteKnowledgeDocumentAction} id={document.id} canEdit={canEdit} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Add knowledge manually</h2>
          {canEdit ? (
            <KnowledgeForm
              action={createKnowledgeDocumentAction}
              submitLabel="Add knowledge"
              pendingLabel="Adding…"
            />
          ) : (
            <PermissionNotice />
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Upload a file</h2>
          {canEdit ? <FileUploadForm /> : <PermissionNotice />}
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Import from a URL</h2>
          {canEdit ? <UrlImportForm /> : <PermissionNotice />}
        </section>
      </div>
    </div>
  );
}
