"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { createSegmentAction, updateSegmentAction, deleteSegmentAction, type ActionState } from "./actions";
import { DeleteButton } from "../_components/delete-button";
import { FIELD_LABEL, OPERATOR_LABEL, OPERATORS_FOR_FIELD, EXISTENCE_ONLY_FIELDS, SEGMENT_CONDITION_FIELDS } from "./segment-condition-fields";
import type { Segment, SegmentCondition, SegmentConditionField, SegmentMatchType } from "@/lib/supabase/types";

const SELECT_CLASS =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors hover:border-ds-border-strong focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

const INPUT_CLASS =
  "w-32 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

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
        className="rounded-ds-sm p-1 text-ds-text-muted transition-colors hover:bg-ds-danger-bg hover:text-ds-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        <X className="size-3.5" aria-hidden="true" />
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

  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) onDone?.();
  }

  function updateCondition(index: number, next: SegmentCondition) {
    setConditions((current) => current.map((condition, i) => (i === index ? next : condition)));
  }

  const ruleJson = JSON.stringify({ matchType, conditions });

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-ds-sm bg-ds-surface-soft p-3">
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
          className="w-56 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-ds-text-secondary">
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
        className="flex w-fit items-center gap-1 rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-accent transition-colors hover:bg-ds-accent-soft-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add condition
      </button>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !name.trim() || conditions.length === 0}
          className="rounded-ds-sm bg-ds-accent px-2.5 py-1 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Saving…" : segment ? "Save segment" : "Create segment"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            disabled={isPending}
            className="rounded-ds-sm px-2.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60"
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
    <div className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 hover:bg-ds-surface-soft">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-ds-text-primary">{segment.name}</span>
        {segment.description ? <span className="text-xs text-ds-text-muted">{segment.description}</span> : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="segment-manager-panel"
        className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {open ? "Hide segments" : "Manage segments"}
      </button>
      {open ? (
        <div id="segment-manager-panel" className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
          {segments.length === 0 ? (
            <p className="text-xs text-ds-text-muted">No segments yet -- create the first one below.</p>
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
                className="flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                New segment
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
