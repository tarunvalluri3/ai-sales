"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WebsiteSuggestionState } from "@/lib/schemas/website-suggestions";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { reviewWebsiteSuggestionAction, suggestFromWebsiteAction } from "../../website-suggestion-actions";

const inputClass = "w-full rounded border border-ds-border bg-ds-surface px-3 py-2 text-sm";
const buttonClass = "rounded border border-ds-border px-3 py-2 text-sm focus-visible:outline-2 disabled:opacity-60";

export function WebsiteSuggestionReview({ review, document }: {
  review: WebsiteSuggestionState;
  document: KnowledgeDocument;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  const router = useRouter();
  function submit(action: () => Promise<{ error?: string }>) {
    setError(undefined);
    start(async () => {
      try {
        const result = await action();
        setError(result.error);
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
    <section className="flex flex-col gap-3 border border-ds-border bg-ds-surface p-4">
      <h3 className="text-sm font-medium">{document.title}</h3>
      {(status === "idle" || retry) && (
        <button type="button" disabled={busy}
          onClick={() => submit(() => suggestFromWebsiteAction({ documentId: document.id, retry }))}
          className={buttonClass}>
          {busy ? "Generating suggestions…" : retry ? "Try again" : "Suggest FAQs and products from these pages"}
        </button>
      )}
      {status === "running" && <p role="status" className="text-sm">Generating suggestions…</p>}
      {status === "failed" && !error && <p role="status" className="text-sm">Couldn’t generate suggestions. You can keep setting up your agent.</p>}
      {error && <p role="alert" className="text-sm text-ds-danger">{error}</p>}
      {review.suggestions.map((item) => (
        <form key={item.id} className="flex flex-col gap-2 rounded border border-ds-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const button = (event.nativeEvent as SubmitEvent).submitter;
            const form = new FormData(event.currentTarget, button);
            submit(() => reviewWebsiteSuggestionAction(form));
          }}>
          <input name="documentId" type="hidden" value={document.id} />
          <input name="itemId" type="hidden" value={item.id} />
          <p className="text-sm font-medium">Draft {item.kind === "faq" ? "FAQ" : item.kind}</p>
          {item.kind === "faq" ? (
            <>
              <label className="text-sm">Question<input className={inputClass} name="question" defaultValue={item.question} maxLength={300} /></label>
              <label className="text-sm">Answer<textarea className={inputClass} name="answer" defaultValue={item.answer} maxLength={2000} /></label>
            </>
          ) : (
            <>
              <label className="text-sm">Name<input className={inputClass} name="name" defaultValue={item.name} maxLength={120} /></label>
              <label className="text-sm">Description<textarea className={inputClass} name="description" defaultValue={item.description} maxLength={2000} /></label>
              <label className="text-sm">Price<input className={inputClass} name="price" defaultValue={item.price} maxLength={60} /></label>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="operation" value="approve" disabled={busy} className={buttonClass}>Approve</button>
            <button type="submit" name="operation" value="discard" disabled={busy} className={buttonClass}>Discard</button>
          </div>
        </form>
      ))}
    </section>
  );
}
