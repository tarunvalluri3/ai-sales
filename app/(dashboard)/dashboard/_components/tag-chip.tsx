"use client";

import { useEffect, useActionState } from "react";
import { X } from "lucide-react";
import { Badge } from "./badge";
import type { LeadTag } from "@/lib/supabase/types";

export type RemoveTagState = { error?: string; success?: boolean };

/**
 * A tag chip with an inline remove control, shared by the Leads page
 * (lead_tag_assignments) and the conversation detail page's info panel
 * (conversation_tag_assignments) -- both point the same component at
 * their own Server Action + hidden-field shape rather than each hand-
 * rolling their own chip markup. Read-only (`canEdit=false`) renders a
 * plain `Badge` with no button, matching every other role-gated control
 * on this dashboard (StatusSelect, DeleteButton) rather than a disabled
 * button that still looks clickable.
 *
 * `onRemoved` is optional: the Leads page doesn't need it (its Server
 * Action calls `revalidatePath`, so the server-rendered `tags`/
 * `tagsByLeadId` props refresh on their own), but the conversation
 * detail page's info panel deliberately has no `revalidatePath` on this
 * path (STATE.md: removing it fixed a real over-invalidation
 * performance regression) -- its `TagsCard` tracks tags in local state
 * instead and needs to know exactly when a removal actually succeeded.
 */
export function RemovableTagChip({
  tag,
  action,
  hiddenFields,
  canEdit,
  onRemoved,
}: {
  tag: LeadTag;
  action: (prevState: RemoveTagState, formData: FormData) => Promise<RemoveTagState>;
  hiddenFields: Record<string, string>;
  canEdit: boolean;
  onRemoved?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  useEffect(() => {
    if (state.success) {
      onRemoved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!canEdit) {
    return (
      <Badge tone={tag.color} size="sm">
        {tag.name}
      </Badge>
    );
  }

  return (
    <form action={formAction} className="inline-flex">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Badge tone={tag.color} size="sm">
        <span className="inline-flex items-center gap-1">
          {tag.name}
          <button
            type="submit"
            disabled={isPending}
            aria-label={`Remove tag ${tag.name}`}
            title={`Remove tag ${tag.name}`}
            className="rounded-full transition-opacity hover:opacity-70 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            <X className="size-2.5" aria-hidden="true" />
          </button>
        </span>
      </Badge>
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
