"use client";

import { useActionState, useEffect, useRef, type ChangeEvent } from "react";
import type { LeadTag } from "@/lib/supabase/types";

export type TagPickerState = { error?: string; success?: boolean };

/**
 * "Add tag" control shared by the Leads page (assigns to a lead) and the
 * conversation detail page's info panel (assigns to a conversation) --
 * both point this same `<select>` at their own Server Action + hidden
 * fields rather than each hand-rolling their own picker. Only lists
 * tags not already applied (`availableTags` is the caller's job to
 * filter down), auto-submits on change (same pattern as `StatusSelect`),
 * and resets back to the placeholder option after a successful assign
 * since the just-picked tag then disappears from `availableTags` on the
 * next render anyway.
 */
export function TagPicker({
  availableTags,
  action,
  hiddenFields,
  disabled = false,
  onAssigned,
}: {
  availableTags: LeadTag[];
  action: (prevState: TagPickerState, formData: FormData) => Promise<TagPickerState>;
  hiddenFields: Record<string, string>;
  disabled?: boolean;
  /** Called with the picked tag's id once the assign actually succeeds -- see `RemovableTagChip`'s `onRemoved` doc comment for why this exists (the conversation page's `TagsCard` has no `revalidatePath` to fall back on). */
  onAssigned?: (tagId: string) => void;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const selectRef = useRef<HTMLSelectElement>(null);
  const pickedTagIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.success && selectRef.current) {
      selectRef.current.value = "";
      if (pickedTagIdRef.current) {
        onAssigned?.(pickedTagIdRef.current);
        pickedTagIdRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (event.currentTarget.value) {
      pickedTagIdRef.current = event.currentTarget.value;
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (availableTags.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1.5">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <select
        ref={selectRef}
        name="tagId"
        aria-label="Add tag"
        defaultValue=""
        disabled={isPending || disabled}
        onChange={handleChange}
        className="dx-tag-picker h-8 cursor-pointer rounded-full border border-ds-border-strong bg-ds-surface px-3 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">+ Add tag</option>
        {availableTags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
      {state.error ? (
        <span role="alert" className="text-2xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
