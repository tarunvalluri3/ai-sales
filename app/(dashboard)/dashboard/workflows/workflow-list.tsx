"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { WorkflowForm } from "./workflow-form";
import { deleteWorkflowAction, setWorkflowEnabledAction, type ActionState } from "./actions";
import { DeleteButton } from "../_components/delete-button";
import { Badge } from "../_components/badge";
import { EmptyState } from "../_components/state-views";
import type { LeadTag, Workflow } from "@/lib/supabase/types";

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "Lead created",
  lead_status_changed: "Lead status changed",
  lead_score_threshold: "Score threshold",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  appointment_status_changed: "Appointment status changed",
  conversation_needs_attention: "Needs attention",
  human_takeover: "Human takeover",
  ai_handback: "AI hand-back",
  no_activity_hours: "No activity",
};

const initialState: ActionState = {};

function EnabledToggle({ workflow, canEdit }: { workflow: Workflow; canEdit: boolean }) {
  const [state, formAction, isPending] = useActionState(setWorkflowEnabledAction, initialState);

  if (!canEdit) {
    return (
      <Badge tone={workflow.enabled ? "success" : "muted"} size="sm">
        {workflow.enabled ? "Enabled" : "Disabled"}
      </Badge>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={workflow.id} />
      <input type="hidden" name="enabled" value={(!workflow.enabled).toString()} />
      <button
        type="submit"
        disabled={isPending}
        className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide-ds transition-colors ${
          workflow.enabled ? "bg-ds-success-bg text-ds-success hover:opacity-80" : "bg-ds-surface-soft text-ds-text-secondary hover:opacity-80"
        }`}
      >
        {workflow.enabled ? "Enabled" : "Disabled"}
      </button>
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function WorkflowRow({ workflow, tags, canEdit }: { workflow: Workflow; tags: LeadTag[]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <WorkflowForm workflow={workflow} tags={tags} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-ds-sm px-2 py-2 hover:bg-ds-surface-soft">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ds-text-primary">{workflow.name}</span>
        <span className="text-xs text-ds-text-muted">
          {TRIGGER_LABEL[workflow.trigger_type] ?? workflow.trigger_type} · {workflow.steps.length} step{workflow.steps.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <EnabledToggle workflow={workflow} canEdit={canEdit} />
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated hover:text-ds-text-primary"
            >
              Edit
            </button>
            <DeleteButton action={deleteWorkflowAction} id={workflow.id} confirmMessage={`Delete "${workflow.name}"?`} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowList({ workflows, tags, canEdit }: { workflows: Workflow[]; tags: LeadTag[]; canEdit: boolean }) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ds-text-primary">Workflows</h2>
        {canEdit && !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New workflow
          </button>
        ) : null}
      </div>

      {creating ? <WorkflowForm tags={tags} onDone={() => setCreating(false)} /> : null}

      {workflows.length === 0 && !creating ? (
        <EmptyState
          title="No workflows yet"
          description={
            tags.length === 0
              ? "Create a tag on the Leads page first, or start with a workflow that doesn't need one (e.g. a notification on a new lead)."
              : "Automate a repetitive step -- e.g. tag a hot lead, notify the team, or draft a follow-up after a few quiet days."
          }
        />
      ) : (
        <div className="flex flex-col gap-1">
          {workflows.map((workflow) => (
            <WorkflowRow key={workflow.id} workflow={workflow} tags={tags} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
