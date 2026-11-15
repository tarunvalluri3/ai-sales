"use client";

import { useActionState, useEffect, useState } from "react";
import { Tag } from "lucide-react";
import {
  assignTagToConversationAction,
  removeTagFromConversationAction,
  suggestTagsForConversationAction,
  acceptTagSuggestionForConversationAction,
  type SuggestTagsState,
  type AcceptTagSuggestionState,
} from "../actions";
import { RemovableTagChip } from "../../_components/tag-chip";
import { TagPicker } from "../../_components/tag-picker";
import type { LeadTag } from "@/lib/supabase/types";

const suggestInitialState: SuggestTagsState = {};
const acceptInitialState: AcceptTagSuggestionState = {};

function SuggestionChip({
  name,
  conversationId,
  onAccepted,
}: {
  name: string;
  conversationId: string;
  onAccepted: (tag: LeadTag) => void;
}) {
  const [state, formAction, isPending] = useActionState(acceptTagSuggestionForConversationAction, acceptInitialState);

  useEffect(() => {
    if (state.tag) {
      onAccepted(state.tag);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-0.5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="name" value={name} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-7 items-center rounded-full border border-dashed border-ds-border-strong px-3 text-xs font-medium text-ds-text-primary transition-colors hover:border-ds-primary hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {isPending ? "Adding…" : `+ ${name}`}
      </button>
      {state.error ? (
        <span role="alert" className="text-2xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Tags on a conversation: current chips (removable), an "add existing
 * tag" picker, and an on-demand "Suggest tags" button (AI, click-to-
 * accept only -- see `lib/tag-suggestions.ts`). Tracks its own `tags`
 * state locally rather than depending on `revalidatePath`/router
 * refresh: this page's conversation actions deliberately have none
 * (STATE.md documents removing it here as a real performance fix), so
 * every mutation's success is threaded back through a callback instead.
 */
export function TagsCard({
  conversationId,
  initialTags,
  catalogTags,
  canEdit,
}: {
  conversationId: string;
  initialTags: LeadTag[];
  catalogTags: LeadTag[];
  canEdit: boolean;
}) {
  const [tags, setTags] = useState<LeadTag[]>(initialTags);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestState, suggestAction, isSuggesting] = useActionState(
    suggestTagsForConversationAction,
    suggestInitialState,
  );

  // "Adjust state when a value changes" during render (React's own
  // documented alternative to an effect for this exact case), not a
  // useEffect keyed on `suggestState` -- same pattern this codebase's
  // own leads-list.tsx already uses for its tab-change reset.
  const [processedSuggestState, setProcessedSuggestState] = useState(suggestState);
  if (processedSuggestState !== suggestState) {
    setProcessedSuggestState(suggestState);
    if (suggestState.suggestions) {
      const appliedNames = new Set(tags.map((tag) => tag.name.toLowerCase()));
      setSuggestions(suggestState.suggestions.filter((name) => !appliedNames.has(name.toLowerCase())));
    }
  }

  const appliedIds = new Set(tags.map((tag) => tag.id));
  const availableCatalogTags = catalogTags.filter((tag) => !appliedIds.has(tag.id));

  function handleAssigned(tagId: string) {
    const tag = catalogTags.find((candidate) => candidate.id === tagId);
    if (tag) setTags((previous) => [...previous, tag]);
  }

  function handleRemoved(tagId: string) {
    setTags((previous) => previous.filter((tag) => tag.id !== tagId));
  }

  function handleAccepted(tag: LeadTag) {
    setTags((previous) => (previous.some((existing) => existing.id === tag.id) ? previous : [...previous, tag]));
    setSuggestions((previous) => previous.filter((name) => name.toLowerCase() !== tag.name.toLowerCase()));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ds-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-medium text-ds-text-primary">
          <Tag className="size-5" strokeWidth={1.75} aria-hidden="true" />
          Tags
        </h3>
        {canEdit ? (
          <form action={suggestAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button
              type="submit"
              disabled={isSuggesting}
              className="rounded-md text-sm font-medium text-ds-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              {isSuggesting ? "Suggesting…" : "Suggest tags"}
            </button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tags.length === 0 ? <span className="text-xs text-ds-text-secondary">No tags yet.</span> : null}
        {tags.map((tag) => (
          <RemovableTagChip
            key={tag.id}
            tag={tag}
            action={removeTagFromConversationAction}
            hiddenFields={{ conversationId, tagId: tag.id }}
            canEdit={canEdit}
            onRemoved={() => handleRemoved(tag.id)}
          />
        ))}
        {canEdit ? (
          <TagPicker
            availableTags={availableCatalogTags}
            action={assignTagToConversationAction}
            hiddenFields={{ conversationId }}
            onAssigned={handleAssigned}
          />
        ) : null}
      </div>

      {canEdit && (suggestState.error || suggestions.length > 0) ? (
        <div className="flex flex-col items-start gap-2 border-t border-ds-border pt-3">
          {suggestState.error ? (
            <span role="alert" className="text-xs text-ds-danger">
              {suggestState.error}
            </span>
          ) : null}
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ds-text-secondary">AI-suggested — click to add:</span>
              {suggestions.map((name) => (
                <SuggestionChip key={name} name={name} conversationId={conversationId} onAccepted={handleAccepted} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
