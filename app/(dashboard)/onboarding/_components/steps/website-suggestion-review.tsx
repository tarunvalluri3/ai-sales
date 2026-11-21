"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { WebsiteSuggestionState } from "@/lib/schemas/website-suggestions";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { reviewWebsiteSuggestionAction, suggestFromWebsiteAction } from "../../website-suggestion-actions";
import { Card, CardHeader, btnGhost, btnOutline, inputClass, textareaClass } from "../../../dashboard/_components/ui";
import { useToast } from "../../../dashboard/_components/toast";

type PendingOperation = { id: string; kind: "approve" | "discard" };

export function WebsiteSuggestionReview({ review, document }: {
  review: WebsiteSuggestionState;
  document: KnowledgeDocument;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  const [operation, setOperation] = useState<PendingOperation | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  function submit(action: () => Promise<{ error?: string }>, pending: PendingOperation | null = null) {
    setError(undefined);
    setOperation(pending);
    start(async () => {
      try {
        const result = await action();
        setError(result.error);
        if (pending && !result.error) {
          toast({ variant: "success", title: pending.kind === "approve" ? "Suggestion added" : "Suggestion discarded" });
        }
      } catch {
        setError("Couldn’t update suggestions. You can keep setting up your agent.");
      } finally {
        router.refresh();
      }
    });
  }

  if (document.ingestion_status !== "complete") return null;
  const status = review.generation_status;
  const retry = status === "failed" && review.attempts === 1;
  if (status === "ready" && !review.suggestions.length) {
    return <p className="text-sm text-ds-text-secondary">No suggestions to review for {document.title}.</p>;
  }
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title="Review website suggestions" description={document.title} />
      {(status === "idle" || retry) && (
        <button type="button" disabled={busy}
          onClick={() => submit(() => suggestFromWebsiteAction({ documentId: document.id, retry }))}
          className={btnOutline + " min-h-11 max-w-full self-start whitespace-normal text-left"}>
          {busy ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden /> : null}
          {busy ? "Generating suggestions…" : retry ? "Try again" : "Suggest FAQs and products from these pages"}
        </button>
      )}
      {status === "running" && <p role="status" className="text-sm">Generating suggestions…</p>}
      {status === "failed" && !error && <p role="status" className="text-sm">Couldn’t generate suggestions. You can keep setting up your agent.</p>}
      {error && <p role="alert" className="text-sm text-ds-danger">{error}</p>}
      {review.suggestions.map((item) => (
        <form key={item.id} className="flex flex-col gap-3 border-t border-ds-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const button = (event.nativeEvent as SubmitEvent).submitter;
            const form = new FormData(event.currentTarget, button);
            submit(() => reviewWebsiteSuggestionAction(form), {
              id: item.id,
              kind: form.get("operation") === "discard" ? "discard" : "approve",
            });
          }}>
          <input name="documentId" type="hidden" value={document.id} />
          <input name="itemId" type="hidden" value={item.id} />
          <p className="text-sm font-medium">Draft {item.kind === "faq" ? "FAQ" : item.kind}</p>
          {item.kind === "faq" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">Question<input className={inputClass} name="question" defaultValue={item.question} maxLength={300} /></label>
              <label className="flex flex-col gap-1 text-sm">Answer<textarea className={textareaClass} name="answer" defaultValue={item.answer} maxLength={2000} /></label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">Name<input className={inputClass} name="name" defaultValue={item.name} maxLength={120} /></label>
              <label className="flex flex-col gap-1 text-sm">Description<textarea className={textareaClass} name="description" defaultValue={item.description} maxLength={2000} /></label>
              <label className="flex flex-col gap-1 text-sm">Price<input className={inputClass} name="price" defaultValue={item.price} maxLength={60} /></label>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="operation" value="approve" disabled={busy} className={btnOutline + " min-h-11"}>
              {busy && operation?.id === item.id && operation.kind === "approve" ? "Approving…" : "Approve"}
            </button>
            <button type="submit" name="operation" value="discard" disabled={busy} className={btnGhost + " min-h-11"}>
              {busy && operation?.id === item.id && operation.kind === "discard" ? "Discarding…" : "Discard"}
            </button>
          </div>
        </form>
      ))}
    </Card>
  );
}
