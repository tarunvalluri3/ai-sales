"use client";

import { useActionState, useState } from "react";
import { Bell, CalendarDays, Pencil, Plus, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { WorkflowForm } from "./workflow-form";
import { deleteWorkflowAction, setWorkflowEnabledAction, type ActionState } from "./actions";
import { DeleteButton } from "../_components/delete-button";
import { Card, PageHeader, Pill, btnIcon, btnPrimary } from "../_components/ui";
import type { LeadTag, Workflow } from "@/lib/supabase/types";

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "Lead created",
  lead_status_changed: "Lead status changed",
  lead_score_threshold: "Score threshold",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  appointment_status_changed: "Appointment status changed",
  conversation_needs_attention: "Conversation needs attention",
  human_takeover: "Human takeover",
  ai_handback: "AI hand-back",
  no_activity_hours: "No activity",
};

const initialState: ActionState = {};

function TriggerIcon({ triggerType }: { triggerType: string }) {
  const className = "size-6 shrink-0 text-ds-text-primary";
  if (triggerType === "appointment_status_changed") return <CalendarDays className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (triggerType === "conversation_needs_attention" || triggerType === "human_takeover" || triggerType === "ai_handback") {
    return <Bell className={className} strokeWidth={1.75} aria-hidden="true" />;
  }
  return <Zap className={className} strokeWidth={1.75} aria-hidden="true" />;
}

function EnabledToggle({ workflow, canEdit }: { workflow: Workflow; canEdit: boolean }) {
  const [state, formAction, isPending] = useActionState(setWorkflowEnabledAction, initialState);
  const label = (
    <Pill tone={workflow.enabled ? "lime" : "gray"} size="sm" className="font-medium">
      {workflow.enabled ? "Enabled" : "Disabled"}
    </Pill>
  );

  if (!canEdit) return label;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={workflow.id} />
      <input type="hidden" name="enabled" value={(!workflow.enabled).toString()} />
      <button
        type="submit"
        role="switch"
        aria-checked={workflow.enabled}
        aria-label={`${workflow.enabled ? "Disable" : "Enable"} ${workflow.name}`}
        disabled={isPending}
        className="dx-switch focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      />
      {label}
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * The Workflows page's top area: the page title with its "New workflow"
 * button, the list of workflows on the left, and the editor for the selected
 * one on the right (master / detail). Only one editor is ever open; picking a
 * different workflow, or "New workflow", swaps it.
 */
export function WorkflowList({ workflows, tags, canEdit }: { workflows: Workflow[]; tags: LeadTag[]; canEdit: boolean }) {
  // `undefined` = nothing chosen yet, so the first workflow opens; `null` =
  // the editor was closed; "new" = the create form.
  const [selection, setSelection] = useState<string | "new" | null | undefined>(undefined);

  const selectedWorkflow =
    selection === "new" || selection === null
      ? null
      : (workflows.find((workflow) => workflow.id === selection) ?? (selection === undefined ? (workflows[0] ?? null) : null));
  const creating = selection === "new" || (selection === undefined && workflows.length === 0 && canEdit);

  return (
    <>
      <PageHeader
        icon={WorkflowIcon}
        title="Workflows"
        description="Automate the next step. Keep your team in control."
        actions={
          canEdit ? (
            <button type="button" onClick={() => setSelection("new")} className={btnPrimary}>
              <Plus strokeWidth={1.75} className="size-5" aria-hidden="true" />
              New workflow
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="dx-title">Your workflows</h2>
          {workflows.length === 0 ? (
            <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
              {tags.length === 0
                ? "No workflows yet. Create a tag on the Leads page first, or start with a workflow that doesn't need one (e.g. a notification on a new lead)."
                : "No workflows yet. Automate a repetitive step: tag a hot lead, notify the team, or draft a follow-up after a few quiet days."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {workflows.map((workflow) => {
                const active = selectedWorkflow?.id === workflow.id && !creating;
                return (
                  <li
                    key={workflow.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-3 ${active ? "bg-ds-lime-soft" : "hover:bg-ds-surface-soft"}`}
                  >
                    <TriggerIcon triggerType={workflow.trigger_type} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm leading-snug font-medium text-ds-text-primary">{workflow.name}</span>
                      <span className="text-sm text-ds-text-secondary">
                        {TRIGGER_LABEL[workflow.trigger_type] ?? workflow.trigger_type} · {workflow.steps.length} step
                        {workflow.steps.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <EnabledToggle workflow={workflow} canEdit={canEdit} />
                    {canEdit ? (
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setSelection(workflow.id)}
                          aria-label={`Edit ${workflow.name}`}
                          aria-pressed={active}
                          className={btnIcon}
                        >
                          <Pencil className="size-5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                        <DeleteButton
                          action={deleteWorkflowAction}
                          id={workflow.id}
                          variant="icon"
                          label={`Delete ${workflow.name}`}
                          confirmMessage={`Delete "${workflow.name}"?`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {creating ? (
          <WorkflowForm key="new" tags={tags} onDone={() => setSelection(null)} />
        ) : selectedWorkflow && canEdit ? (
          <WorkflowForm key={selectedWorkflow.id} workflow={selectedWorkflow} tags={tags} onDone={() => setSelection(null)} />
        ) : (
          <Card className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium text-ds-text-primary">
              {canEdit ? "Select a workflow to edit" : "Workflows are managed by organisation admins"}
            </p>
            <p className="max-w-sm text-sm text-ds-text-secondary">
              Each workflow runs a trigger, optional conditions, then its steps in order. Every run is logged below.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
