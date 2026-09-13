"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { createWorkflowAction, updateWorkflowAction, type ActionState } from "./actions";
import { FIELD_LABEL, OPERATOR_LABEL, OPERATORS_FOR_FIELD, EXISTENCE_ONLY_FIELDS, SEGMENT_CONDITION_FIELDS } from "../customers/segment-condition-fields";
import { WORKFLOW_TRIGGER_TYPES } from "@/lib/schemas/workflow";
import { LEAD_STATUS_LABEL } from "../leads/lead-status";
import type {
  LeadTag,
  SegmentCondition,
  SegmentConditionField,
  SegmentMatchType,
  Workflow,
  WorkflowStep,
  WorkflowTriggerConfig,
  WorkflowTriggerType,
} from "@/lib/supabase/types";

const SELECT_CLASS =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors hover:border-ds-border-strong focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";
const INPUT_CLASS =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

const TRIGGER_LABEL: Record<WorkflowTriggerType, string> = {
  lead_created: "Lead created",
  lead_status_changed: "Lead status changed",
  lead_score_threshold: "Lead score crosses a threshold",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  appointment_status_changed: "Appointment status changed",
  conversation_needs_attention: "Conversation needs attention",
  human_takeover: "Human takes over a conversation",
  ai_handback: "Conversation handed back to AI",
  no_activity_hours: "No activity for a number of hours",
};

/** Which trigger types have an extra, trigger-specific filter field to configure. */
function needsTriggerConfig(triggerType: WorkflowTriggerType): boolean {
  return ["lead_status_changed", "lead_score_threshold", "tag_added", "tag_removed", "appointment_status_changed", "no_activity_hours"].includes(
    triggerType,
  );
}

function TriggerConfigFields({
  triggerType,
  config,
  onChange,
  tags,
}: {
  triggerType: WorkflowTriggerType;
  config: WorkflowTriggerConfig;
  onChange: (next: WorkflowTriggerConfig) => void;
  tags: LeadTag[];
}) {
  if (triggerType === "lead_status_changed") {
    return (
      <select value={config.status ?? "new"} onChange={(event) => onChange({ ...config, status: event.target.value })} className={SELECT_CLASS}>
        {(["new", "contacted", "converted", "lost"] as const).map((status) => (
          <option key={status} value={status}>
            {LEAD_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
    );
  }
  if (triggerType === "appointment_status_changed") {
    return (
      <select value={config.status ?? "pending"} onChange={(event) => onChange({ ...config, status: event.target.value })} className={SELECT_CLASS}>
        {(["pending", "confirmed", "declined", "cancelled", "completed", "no_show"] as const).map((status) => (
          <option key={status} value={status}>
            {status.replace("_", "-")}
          </option>
        ))}
      </select>
    );
  }
  if (triggerType === "lead_score_threshold") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
        score reaches
        <input
          type="number"
          min={0}
          max={9}
          value={config.threshold ?? 4}
          onChange={(event) => onChange({ ...config, threshold: Number(event.target.value) })}
          className={`${INPUT_CLASS} w-16`}
        />
      </span>
    );
  }
  if (triggerType === "tag_added" || triggerType === "tag_removed") {
    return (
      <select
        value={config.tagId ?? ""}
        onChange={(event) => onChange({ ...config, tagId: event.target.value || null })}
        className={SELECT_CLASS}
      >
        <option value="">Any tag</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    );
  }
  if (triggerType === "no_activity_hours") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
        after
        <input
          type="number"
          min={1}
          max={720}
          value={config.hours ?? 24}
          onChange={(event) => onChange({ ...config, hours: Number(event.target.value) })}
          className={`${INPUT_CLASS} w-16`}
        />
        hours of inactivity
      </span>
    );
  }
  return null;
}

function ConditionRow({ condition, onChange, onRemove }: { condition: SegmentCondition; onChange: (next: SegmentCondition) => void; onRemove: () => void }) {
  const operators = OPERATORS_FOR_FIELD[condition.field];
  const showValue = !EXISTENCE_ONLY_FIELDS.has(condition.field);

  function handleFieldChange(field: SegmentConditionField) {
    const nextOperators = OPERATORS_FOR_FIELD[field];
    onChange({ field, operator: nextOperators[0], value: EXISTENCE_ONLY_FIELDS.has(field) ? null : "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={condition.field} onChange={(event) => handleFieldChange(event.target.value as SegmentConditionField)} className={SELECT_CLASS}>
        {SEGMENT_CONDITION_FIELDS.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABEL[field]}
          </option>
        ))}
      </select>
      <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as SegmentCondition["operator"] })} className={SELECT_CLASS}>
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABEL[operator]}
          </option>
        ))}
      </select>
      {showValue ? (
        <input
          type="text"
          value={condition.value === null ? "" : String(condition.value)}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
          className={`${INPUT_CLASS} w-28`}
        />
      ) : null}
      <button type="button" onClick={onRemove} aria-label="Remove condition" className="rounded-ds-sm p-1 text-ds-text-muted transition-colors hover:bg-ds-danger-bg hover:text-ds-danger">
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

const STEP_TYPES = [
  "wait",
  "add_tag",
  "remove_tag",
  "update_lead_status",
  "flag_attention",
  "assign_owner",
  "create_task",
  "generate_followup_draft",
  "internal_notification",
  "email_notification",
] as const;

const STEP_LABEL: Record<(typeof STEP_TYPES)[number], string> = {
  wait: "Wait",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  update_lead_status: "Update lead status",
  flag_attention: "Flag conversation for attention",
  assign_owner: "Assign to a team member",
  create_task: "Create a sales task",
  generate_followup_draft: "Draft an AI follow-up message",
  internal_notification: "Send an in-app notification",
  email_notification: "Send an email notification",
};

function defaultStepOfType(type: (typeof STEP_TYPES)[number], tags: LeadTag[]): WorkflowStep {
  switch (type) {
    case "wait":
      return { type: "wait", unit: "hours", amount: 4 };
    case "add_tag":
      return { type: "add_tag", tagId: tags[0]?.id ?? "" };
    case "remove_tag":
      return { type: "remove_tag", tagId: tags[0]?.id ?? "" };
    case "update_lead_status":
      return { type: "update_lead_status", status: "contacted" };
    case "flag_attention":
      return { type: "flag_attention" };
    case "assign_owner":
      return { type: "assign_owner" };
    case "create_task":
      return { type: "create_task", title: "Follow up", description: null };
    case "generate_followup_draft":
      return { type: "generate_followup_draft" };
    case "internal_notification":
      return { type: "internal_notification", message: "" };
    case "email_notification":
      return { type: "email_notification", subject: "", message: "" };
  }
}

function StepRow({ step, tags, onChange, onRemove }: { step: WorkflowStep; tags: LeadTag[]; onChange: (next: WorkflowStep) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-ds-sm bg-ds-surface p-2">
      <div className="flex items-center gap-1.5">
        <select
          value={step.type}
          onChange={(event) => onChange(defaultStepOfType(event.target.value as (typeof STEP_TYPES)[number], tags))}
          className={SELECT_CLASS}
        >
          {STEP_TYPES.map((type) => (
            <option key={type} value={type}>
              {STEP_LABEL[type]}
            </option>
          ))}
        </select>

        {step.type === "wait" ? (
          <>
            <input
              type="number"
              min={1}
              max={999}
              value={step.amount}
              onChange={(event) => onChange({ ...step, amount: Number(event.target.value) })}
              className={`${INPUT_CLASS} w-16`}
            />
            <select value={step.unit} onChange={(event) => onChange({ ...step, unit: event.target.value as typeof step.unit })} className={SELECT_CLASS}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </>
        ) : null}

        {step.type === "add_tag" || step.type === "remove_tag" ? (
          <select value={step.tagId} onChange={(event) => onChange({ ...step, tagId: event.target.value })} className={SELECT_CLASS}>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        ) : null}

        {step.type === "update_lead_status" ? (
          <select value={step.status} onChange={(event) => onChange({ ...step, status: event.target.value as typeof step.status })} className={SELECT_CLASS}>
            {(["new", "contacted", "converted", "lost"] as const).map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        ) : null}

        <button type="button" onClick={onRemove} aria-label="Remove step" className="ml-auto rounded-ds-sm p-1 text-ds-text-muted transition-colors hover:bg-ds-danger-bg hover:text-ds-danger">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {step.type === "create_task" ? (
        <input
          type="text"
          value={step.title}
          onChange={(event) => onChange({ ...step, title: event.target.value })}
          placeholder="Task title"
          maxLength={200}
          className={INPUT_CLASS}
        />
      ) : null}
      {step.type === "internal_notification" ? (
        <input
          type="text"
          value={step.message}
          onChange={(event) => onChange({ ...step, message: event.target.value })}
          placeholder="Notification message"
          maxLength={500}
          className={INPUT_CLASS}
        />
      ) : null}
      {step.type === "email_notification" ? (
        <>
          <input
            type="text"
            value={step.subject}
            onChange={(event) => onChange({ ...step, subject: event.target.value })}
            placeholder="Email subject"
            maxLength={200}
            className={INPUT_CLASS}
          />
          <input
            type="text"
            value={step.message}
            onChange={(event) => onChange({ ...step, message: event.target.value })}
            placeholder="Email message"
            maxLength={2000}
            className={INPUT_CLASS}
          />
        </>
      ) : null}
    </div>
  );
}

const initialState: ActionState = {};

export function WorkflowForm({ workflow, tags, onDone }: { workflow?: Workflow; tags: LeadTag[]; onDone?: () => void }) {
  const action = workflow ? updateWorkflowAction : createWorkflowAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>(workflow?.trigger_type ?? "lead_created");
  const [triggerConfig, setTriggerConfig] = useState<WorkflowTriggerConfig>(workflow?.trigger_config ?? {});
  const [matchType, setMatchType] = useState<SegmentMatchType>(workflow?.match_type ?? "all");
  const [conditions, setConditions] = useState<SegmentCondition[]>(workflow?.conditions ?? []);
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow?.steps ?? [defaultStepOfType("internal_notification", tags)]);
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);

  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) onDone?.();
  }

  const definition = JSON.stringify({ triggerType, triggerConfig, matchType, conditions, steps, enabled });

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-ds-sm bg-ds-surface-soft p-3">
      {workflow ? <input type="hidden" name="id" value={workflow.id} /> : null}
      <input type="hidden" name="definition" value={definition} />

      <div className="flex flex-wrap items-center gap-2">
        <input type="text" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Workflow name" maxLength={80} disabled={isPending} className={INPUT_CLASS} />
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
        <label className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Enabled
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ds-text-secondary">
        <span className="font-semibold text-ds-text-primary">When</span>
        <select value={triggerType} onChange={(event) => setTriggerType(event.target.value as WorkflowTriggerType)} className={SELECT_CLASS}>
          {WORKFLOW_TRIGGER_TYPES.map((type) => (
            <option key={type} value={type}>
              {TRIGGER_LABEL[type]}
            </option>
          ))}
        </select>
        {needsTriggerConfig(triggerType) ? <TriggerConfigFields triggerType={triggerType} config={triggerConfig} onChange={setTriggerConfig} tags={tags} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
          <span className="font-semibold text-ds-text-primary">And</span>
          <select value={matchType} onChange={(event) => setMatchType(event.target.value as SegmentMatchType)} className={SELECT_CLASS}>
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          <span>of these are also true (optional):</span>
        </div>
        {conditions.map((condition, index) => (
          <ConditionRow
            key={index}
            condition={condition}
            onChange={(next) => setConditions((current) => current.map((c, i) => (i === index ? next : c)))}
            onRemove={() => setConditions((current) => current.filter((_, i) => i !== index))}
          />
        ))}
        <button
          type="button"
          onClick={() => setConditions((current) => [...current, { field: "score", operator: "gte", value: "4" }])}
          className="flex w-fit items-center gap-1 rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-accent transition-colors hover:bg-ds-accent-soft-bg"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add condition
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ds-text-primary">Then, in order:</span>
        {steps.map((step, index) => (
          <StepRow
            key={index}
            step={step}
            tags={tags}
            onChange={(next) => setSteps((current) => current.map((s, i) => (i === index ? next : s)))}
            onRemove={() => setSteps((current) => current.filter((_, i) => i !== index))}
          />
        ))}
        <button
          type="button"
          onClick={() => setSteps((current) => [...current, defaultStepOfType("internal_notification", tags)])}
          className="flex w-fit items-center gap-1 rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-accent transition-colors hover:bg-ds-accent-soft-bg"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add step
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !name.trim() || steps.length === 0}
          className="rounded-ds-sm bg-ds-accent px-2.5 py-1 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : workflow ? "Save workflow" : "Create workflow"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} disabled={isPending} className="rounded-ds-sm px-2.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60">
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
