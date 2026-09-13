"use client";

import { useActionState, useState, type FormEvent } from "react";
import { createTagAction, updateTagAction, deleteTagAction, type TagState } from "./actions";
import { TAG_COLORS, TAG_COLOR_LABEL } from "../_components/tag-colors";
import { Badge } from "../_components/badge";
import { DeleteButton } from "../_components/delete-button";
import type { LeadTag, TagColor } from "@/lib/supabase/types";

const SELECT_CLASS =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors hover:border-ds-border-strong focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

const INPUT_CLASS =
  "w-40 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

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
        className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
      <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-ds-sm bg-ds-surface-soft p-2">
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
          className="rounded-ds-sm bg-ds-accent px-2.5 py-1 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
          className="rounded-ds-sm px-2.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
    <div className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 hover:bg-ds-surface-soft">
      <Badge tone={tag.color} size="sm">
        {tag.name}
      </Badge>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="tag-manager-panel"
        className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {open ? "Hide tag manager" : "Manage tags"}
      </button>
      {open ? (
        <div
          id="tag-manager-panel"
          className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4"
        >
          {tags.length === 0 ? (
            <p className="text-xs text-ds-text-muted">No tags yet -- create the first one below.</p>
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
