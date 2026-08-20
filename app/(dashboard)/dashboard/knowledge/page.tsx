import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { DeleteButton } from "../_components/delete-button";
import { KnowledgeForm } from "./knowledge-form";
import { IngestionStatusPill } from "./_components/ingestion-status-pill";
import { RetryIngestionButton } from "./_components/retry-ingestion-button";
import {
  createKnowledgeDocumentAction,
  deleteKnowledgeDocumentAction,
  retryIngestionAction,
} from "./actions";

export default async function KnowledgePage() {
  const { businessId } = await requireBusinessContext();
  const documents = await listKnowledgeDocumentsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Knowledge</h1>
        <p className="text-sm text-ds-text-secondary">
          This is what your AI sales employee is allowed to know.
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No knowledge documents yet</p>
          <p className="mt-1 text-sm text-ds-text-secondary">
            Add your first document below so your AI sales employee has approved knowledge to draw
            from.
          </p>
        </div>
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
                </div>
                <p className="line-clamp-2 text-sm text-ds-text-secondary">{document.content}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {document.ingestion_status === "failed" ? (
                  <RetryIngestionButton action={retryIngestionAction} id={document.id} />
                ) : null}
                <Link
                  href={`/dashboard/knowledge/${document.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
                <DeleteButton action={deleteKnowledgeDocumentAction} id={document.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="flex w-full max-w-lg flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Add knowledge</h2>
        <KnowledgeForm
          action={createKnowledgeDocumentAction}
          submitLabel="Add knowledge"
          pendingLabel="Adding…"
        />
      </section>
    </div>
  );
}
