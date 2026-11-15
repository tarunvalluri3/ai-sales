"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronDown, Plus, SlidersHorizontal, X } from "lucide-react";
import { btnGhost, btnGhostSm, btnPrimarySm, btnText } from "../_components/ui";
import { createSegmentAction, updateSegmentAction, deleteSegmentAction, type ActionState } from "./actions";
import { DeleteButton } from "../_components/delete-button";
import { FIELD_LABEL, OPERATOR_LABEL, OPERATORS_FOR_FIELD, EXISTENCE_ONLY_FIELDS, SEGMENT_CONDITION_FIELDS } from "./segment-condition-fields";
import type { Segment, SegmentCondition, SegmentConditionField, SegmentMatchType } from "@/lib/supabase/types";

const SELECT_CLASS =
  "h-9 min-h-0 rounded-lg border border-ds-border-strong bg-ds-surface px-2 text-sm text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-60";

const INPUT_CLASS =
  "h-9 min-h-0 w-36 rounded-lg border border-ds-border-strong bg-ds-surface px-2.5 text-sm text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-60";

function defaultCondition(): SegmentCondition {
  return { field: "score", operator: "gte", value: "80" };
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  onChange: (next: SegmentCondition) => void;
  onRemove: () => void;
}) {
  const operators = OPERATORS_FOR_FIELD[condition.field];
  const showValue = !EXISTENCE_ONLY_FIELDS.has(condition.field);

  function handleFieldChange(field: SegmentConditionField) {
    const nextOperators = OPERATORS_FOR_FIELD[field];
    onChange({ field, operator: nextOperators[0], value: EXISTENCE_ONLY_FIELDS.has(field) ? null : "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Field"
        value={condition.field}
        onChange={(event) => handleFieldChange(event.target.value as SegmentConditionField)}
        className={SELECT_CLASS}
      >
        {SEGMENT_CONDITION_FIELDS.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABEL[field]}
          </option>
        ))}
      </select>
      <select
        aria-label="Operator"
        value={condition.operator}
        onChange={(event) => onChange({ ...condition, operator: event.target.value as SegmentCondition["operator"] })}
        className={SELECT_CLASS}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABEL[operator]}
          </option>
        ))}
      </select>
      {showValue ? (
        <input
          type="text"
          aria-label="Value"
          value={condition.value === null ? "" : String(condition.value)}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
          className={INPUT_CLASS}
        />
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove condition"
        title="Remove condition"
        className="flex size-8 items-center justify-center rounded-lg text-ds-text-secondary transition-colors hover:bg-ds-danger-bg hover:text-ds-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <X strokeWidth={1.75} className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const initialState: ActionState = {};

function SegmentForm({ segment, onDone }: { segment?: Segment; onDone?: () => void }) {
  const action = segment ? updateSegmentAction : createSegmentAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [name, setName] = useState(segment?.name ?? "");
  const [description, setDescription] = useState(segment?.description ?? "");
  const [matchType, setMatchType] = useState<SegmentMatchType>(segment?.match_type ?? "all");
  const [conditions, setConditions] = useState<SegmentCondition[]>(segment?.conditions ?? [defaultCondition()]);

  // Calling onDone() here must happen in an effect, not during render: it
  // updates a *different* component's state (the parent's `creating`/
  // `editing` flag), and React forbids updating another component's state
  // while this one is still rendering ("Cannot update a component while
  // rendering a different component").
  useEffect(() => {
    if (state.success) onDone?.();
  }, [state, onDone]);

  function updateCondition(index: number, next: SegmentCondition) {
    setConditions((current) => current.map((condition, i) => (i === index ? next : condition)));
  }

  const ruleJson = JSON.stringify({ matchType, conditions });

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl bg-ds-surface-soft p-3">
      {segment ? <input type="hidden" name="id" value={segment.id} /> : null}
      <input type="hidden" name="rule" value={ruleJson} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Segment name"
          maxLength={60}
          disabled={isPending}
          className={INPUT_CLASS}
        />
        <input
          type="text"
          name="description"
          value={description ?? ""}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          maxLength={300}
          disabled={isPending}
          className={`${INPUT_CLASS} w-56`}
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-ds-text-secondary">
        <span>Match</span>
        <select value={matchType} onChange={(event) => setMatchType(event.target.value as SegmentMatchType)} className={SELECT_CLASS}>
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        <span>of the following conditions:</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {conditions.map((condition, index) => (
          <ConditionRow
            key={index}
            condition={condition}
            onChange={(next) => updateCondition(index, next)}
            onRemove={() => setConditions((current) => current.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setConditions((current) => [...current, defaultCondition()])}
        className="flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />
        Add condition
      </button>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !name.trim() || conditions.length === 0}
          className={btnPrimarySm}
        >
          {isPending ? "Saving…" : segment ? "Save segment" : "Create segment"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            disabled={isPending}
            className={btnText}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function ExistingSegmentRow({ segment }: { segment: Segment }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <SegmentForm segment={segment} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-ds-surface-soft">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-ds-text-primary">{segment.name}</span>
        {segment.description ? <span className="text-xs text-ds-text-secondary">{segment.description}</span> : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={btnText}
        >
          Edit
        </button>
        <DeleteButton action={deleteSegmentAction} id={segment.id} confirmMessage={`Delete "${segment.name}"?`} />
      </div>
    </div>
  );
}

/**
 * Segment catalog manager: create/edit/delete, collapsed behind a
 * disclosure toggle (same convention as the Leads page's TagManager and
 * the Appointments availability page's "Advanced" section) rather than a
 * modal -- this codebase has no modal/dialog component anywhere.
 * org:admin-gated (segments drive Phase 29's automations once those
 * exist, a stricter tier than tags' org:sales_agent).
 */
export function SegmentManager({ segments, canManage }: { segments: Segment[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!canManage) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="segment-manager-panel"
        className={btnGhost}
      >
        <SlidersHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Manage segments
        <ChevronDown strokeWidth={1.75} className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id="segment-manager-panel"
          className="absolute top-13 right-0 z-30 flex max-h-[70vh] w-[min(38rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-2xl border border-ds-border bg-ds-surface p-4 shadow-float"
        >
          {segments.length === 0 ? (
            <p className="text-xs text-ds-text-secondary">No segments yet. Create the first one below.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {segments.map((segment) => (
                <ExistingSegmentRow key={segment.id} segment={segment} />
              ))}
            </div>
          )}
          <div className="border-t border-ds-border pt-3">
            {creating ? (
              <SegmentForm onDone={() => setCreating(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={btnGhostSm}
              >
                <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />
                New segment
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
