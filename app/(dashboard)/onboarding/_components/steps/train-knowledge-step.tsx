"use client";

import { WizardActions, WizardContinue } from "../wizard-actions";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { KnowledgeForm } from "../../../dashboard/knowledge/knowledge-form";
import { FileUploadForm } from "../../../dashboard/knowledge/_components/file-upload-form";
import { UrlImportForm } from "../../../dashboard/knowledge/_components/url-import-form";
import { AddKnowledgeTabs } from "../../../dashboard/knowledge/_components/add-knowledge-tabs";
import { KnowledgeList } from "../../../dashboard/knowledge/_components/knowledge-list";
import { createKnowledgeDocumentAction, updateKnowledgeDocumentInPlaceAction } from "../../../dashboard/knowledge/actions";
import type { WebsiteSuggestionState } from "@/lib/schemas/website-suggestions";
import { WebsiteSuggestionReview } from "./website-suggestion-review";
import { continueOnboarding } from "../../actions";
import { Card } from "../../../dashboard/_components/ui";
import { useToast } from "../../../dashboard/_components/toast";

const MIN_SOURCES = 1;
const POLL_INTERVAL_MS = 3000;

/** Same "live" definition KnowledgeList already uses for its own live-count line -- published AND ingestion complete. */
function isSourceReady(document: KnowledgeDocument): boolean {
  return document.status === "published" && document.ingestion_status === "complete";
}

export function TrainKnowledgeStep({ documents, agentPublished, website, imports }: {
  documents: KnowledgeDocument[];
  agentPublished: boolean;
  website: string;
  imports: WebsiteSuggestionState[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const readyCount = documents.filter(isSourceReady).length;
  const valid = readyCount >= MIN_SOURCES;
  const stillSettling = documents.length > 0 && !valid;
  const importProcessing = imports.some(({ document_id, generation_status }) => generation_status === "running" ||
    documents.some((doc) => doc.id === document_id && (doc.ingestion_status === "pending" || doc.ingestion_status === "processing")));

  // While at least one source exists but none is both published and
  // fully ingested yet, poll so Continue enables itself the moment
  // embedding finishes (or the user publishes a draft from the list)
  // without a manual reload (2026-10-29 bugfix, STATE.md).
  useEffect(() => {
    if (!stillSettling && !importProcessing) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stillSettling, importProcessing, router]);

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      // One request: on success the server redirects straight to the next
      // step (continueOnboarding); only a refusal comes back here.
      const result = await continueOnboarding("products");
      if (result && !result.ok) setError(result.error);
    });
  }

  const editingDocument = editingId ? (documents.find((d) => d.id === editingId) ?? null) : null;
  const { toast } = useToast();
  const confirmAdded = useCallback(() => {
    toast({ variant: "success", title: "Knowledge added" });
  }, [toast]);
  const confirmEdited = useCallback(() => {
    setEditingId(null);
    toast({ variant: "success", title: "Knowledge saved" });
  }, [toast]);

  return (
    <div className="flex flex-col gap-6">
      {editingDocument ? (
        <Card className="onboarding-save-form flex flex-col gap-4">
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
            onSuccess={confirmEdited}
          />
        </Card>
      ) : (
        <div className="onboarding-save-form">
        <AddKnowledgeTabs
          sticky={false}
          websiteFirst
          manualForm={
            <KnowledgeForm action={createKnowledgeDocumentAction} submitLabel="Add knowledge" pendingLabel="Adding…" onSuccess={confirmAdded} />
          }
          fileForm={<FileUploadForm />}
          urlForm={<UrlImportForm initialUrl={website} onboarding />}
        />
        </div>
      )}

      <KnowledgeList documents={documents} agentPublished={agentPublished} stacked canEdit onEdit={(id) => setEditingId(id)} />
      {imports.map((review) => {
        const document = documents.find((row) => row.id === review.document_id);
        return document ? <WebsiteSuggestionReview key={document.id} document={document} review={review} /> : null;
      })}

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <WizardActions onBack={() => router.push("/onboarding")}>
        <WizardContinue onClick={handleContinue} pending={isPending} disabled={!valid}
          reason={valid ? undefined : stillSettling
            ? "Approve any drafts and wait for processing to finish"
            : "Add a knowledge source to continue"} />
      </WizardActions>
    </div>
  );
}
