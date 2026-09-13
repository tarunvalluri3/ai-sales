"use client";

import { useActionState, useEffect, useState } from "react";
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
        className="rounded-full border border-dashed border-ds-border px-2 py-0.5 text-2xs font-medium text-ds-text-secondary transition-colors hover:border-ds-accent hover:text-ds-text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <h3 className="text-sm font-medium text-ds-text-primary">Tags</h3>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 ? <span className="text-xs text-ds-text-muted">No tags yet.</span> : null}
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
      </div>

      {canEdit ? (
        <TagPicker
          availableTags={availableCatalogTags}
          action={assignTagToConversationAction}
          hiddenFields={{ conversationId }}
          onAssigned={handleAssigned}
        />
      ) : null}

      {canEdit ? (
        <div className="flex flex-col items-start gap-1.5 border-t border-ds-border pt-2">
          <form action={suggestAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button
              type="submit"
              disabled={isSuggesting}
              className="inline-flex items-center rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {isSuggesting ? "Suggesting…" : "Suggest tags"}
            </button>
          </form>
          {suggestState.error ? (
            <span role="alert" className="text-xs text-ds-danger">
              {suggestState.error}
            </span>
          ) : null}
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs text-ds-text-muted">AI-suggested — click to add:</span>
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
