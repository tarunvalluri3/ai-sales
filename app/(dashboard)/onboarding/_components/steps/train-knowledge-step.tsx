"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { KnowledgeForm } from "../../../dashboard/knowledge/knowledge-form";
import { FileUploadForm } from "../../../dashboard/knowledge/_components/file-upload-form";
import { UrlImportForm } from "../../../dashboard/knowledge/_components/url-import-form";
import { AddKnowledgeTabs } from "../../../dashboard/knowledge/_components/add-knowledge-tabs";
import { KnowledgeList } from "../../../dashboard/knowledge/_components/knowledge-list";
import { createKnowledgeDocumentAction, updateKnowledgeDocumentInPlaceAction } from "../../../dashboard/knowledge/actions";
import { advanceOnboarding } from "../../actions";

const MIN_SOURCES = 1;
const POLL_INTERVAL_MS = 3000;

/** Same "live" definition KnowledgeList already uses for its own live-count line -- published AND ingestion complete. */
function isSourceReady(document: KnowledgeDocument): boolean {
  return document.status === "published" && document.ingestion_status === "complete";
}

export function TrainKnowledgeStep({ documents }: { documents: KnowledgeDocument[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const readyCount = documents.filter(isSourceReady).length;
  const valid = readyCount >= MIN_SOURCES;
  const stillSettling = documents.length > 0 && !valid;

  // While at least one source exists but none is both published and
  // fully ingested yet, poll so Continue enables itself the moment
  // embedding finishes (or the user publishes a draft from the list)
  // without a manual reload (2026-10-29 bugfix, STATE.md).
  useEffect(() => {
    if (!stillSettling) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stillSettling, router]);

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOnboarding("products");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=products");
    });
  }

  const editingDocument = editingId ? (documents.find((d) => d.id === editingId) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <KnowledgeList documents={documents} canEdit onEdit={(id) => setEditingId(id)} />

      {editingDocument ? (
        <div className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ds-text-primary">Edit knowledge</h2>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-xs font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
            >
              Cancel
            </button>
          </div>
          <KnowledgeForm
            key={editingDocument.id}
            action={updateKnowledgeDocumentInPlaceAction}
            id={editingDocument.id}
            initialTitle={editingDocument.title}
            initialContent={editingDocument.content}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            onSuccess={() => setEditingId(null)}
          />
        </div>
      ) : (
        <AddKnowledgeTabs
          manualForm={
            <KnowledgeForm action={createKnowledgeDocumentAction} submitLabel="Add knowledge" pendingLabel="Adding…" />
          }
          fileForm={<FileUploadForm />}
          urlForm={<UrlImportForm />}
        />
      )}

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span />
        <div className="flex items-center gap-3">
          {!valid ? (
            <span className="text-xs text-ds-text-muted">
              {stillSettling
                ? "Publish it and wait for processing to finish — this usually takes a few seconds"
                : "Add at least one knowledge source to continue"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !valid}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
