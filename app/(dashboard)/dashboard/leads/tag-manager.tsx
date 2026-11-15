"use client";

import { useActionState, useState, type FormEvent } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { btnGhost, btnGhostSm, btnPrimarySm, btnText } from "../_components/ui";
import { createTagAction, updateTagAction, deleteTagAction, type TagState } from "./actions";
import { TAG_COLORS, TAG_COLOR_LABEL } from "../_components/tag-colors";
import { Badge } from "../_components/badge";
import { DeleteButton } from "../_components/delete-button";
import type { LeadTag, TagColor } from "@/lib/supabase/types";

const SELECT_CLASS =
  "h-9 min-h-0 rounded-lg border border-ds-border-strong bg-ds-surface px-2 text-sm text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-60";

const INPUT_CLASS =
  "h-9 min-h-0 w-40 rounded-lg border border-ds-border-strong bg-ds-surface px-2.5 text-sm text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-60";

function ColorSelect({
  value,
  onChange,
  disabled,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
  disabled?: boolean;
}) {
  return (
    <select
      name="color"
      aria-label="Tag color"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TagColor)}
      className={SELECT_CLASS}
    >
      {TAG_COLORS.map((color) => (
        <option key={color} value={color}>
          {TAG_COLOR_LABEL[color]}
        </option>
      ))}
    </select>
  );
}

const createInitialState: TagState = {};

function NewTagForm() {
  const [state, formAction, isPending] = useActionState(createTagAction, createInitialState);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("muted");

  // Adjust state during render when `state` changes (React's documented
  // alternative to an effect for this), not a useEffect keyed on
  // `[state]` -- same pattern leads-list.tsx already uses for its own
  // tab-change reset.
  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) {
      setName("");
      setColor("muted");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!name.trim()) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Badge tone={color} size="sm">
        {name.trim() || "Preview"}
      </Badge>
      <input
        type="text"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New tag name"
        maxLength={40}
        disabled={isPending}
        className={INPUT_CLASS}
      />
      <ColorSelect value={color} onChange={setColor} disabled={isPending} />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className={btnGhostSm}
      >
        {isPending ? "Adding…" : "Add tag"}
      </button>
      {state.error ? (
        <span role="alert" className="w-full text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

const updateInitialState: TagState = {};

function ExistingTagRow({ tag }: { tag: LeadTag }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<TagColor>(tag.color);
  const [state, formAction, isPending] = useActionState(updateTagAction, updateInitialState);

  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-xl bg-ds-surface-soft p-2">
        <input type="hidden" name="id" value={tag.id} />
        <Badge tone={color} size="sm">
          {name.trim() || "Preview"}
        </Badge>
        <input
          type="text"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          disabled={isPending}
          className={INPUT_CLASS}
        />
        <ColorSelect value={color} onChange={setColor} disabled={isPending} />
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className={btnPrimarySm}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(tag.name);
            setColor(tag.color);
          }}
          disabled={isPending}
          className={btnText}
        >
          Cancel
        </button>
        {state.error ? (
          <span role="alert" className="w-full text-xs text-ds-danger">
            {state.error}
          </span>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-ds-surface-soft">
      <Badge tone={tag.color} size="sm">
        {tag.name}
      </Badge>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={btnText}
        >
          Rename
        </button>
        <DeleteButton
          action={deleteTagAction}
          id={tag.id}
          confirmMessage={`Delete "${tag.name}"? It'll be removed from every lead and conversation it's applied to.`}
        />
      </div>
    </div>
  );
}

/**
 * The business's tag catalog: create/rename/delete, collapsed by default
 * behind a "Manage tags" toggle (same disclosure convention as the
 * Appointments availability page's "Advanced" section) rather than a
 * modal -- this codebase has no modal/dialog component anywhere, and
 * catalog management is an occasional action, not the page's main task.
 */
export function TagManager({ tags, canEdit }: { tags: LeadTag[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="tag-manager-panel"
        className={btnGhost}
      >
        <Tag className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Manage tags
        <ChevronDown strokeWidth={1.75} className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id="tag-manager-panel"
          className="absolute top-13 right-0 z-30 flex w-[min(30rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-ds-border bg-ds-surface p-4 shadow-float"
        >
          {tags.length === 0 ? (
            <p className="text-xs text-ds-text-secondary">No tags yet. Create the first one below.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {tags.map((tag) => (
                <ExistingTagRow key={tag.id} tag={tag} />
              ))}
            </div>
          )}
          <div className="border-t border-ds-border pt-3">
            <NewTagForm />
          </div>
        </div>
      ) : null}
    </div>
  );
}
