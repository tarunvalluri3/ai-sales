"use client";

import { useActionState } from "react";
import { cancelWorkflowRunAction, type ActionState } from "./actions";
import { Badge, type BadgeTone } from "../_components/badge";
import { EmptyState } from "../_components/state-views";
import type { WorkflowRun, WorkflowRunStatus } from "@/lib/supabase/types";

const STATUS_TONE: Record<WorkflowRunStatus, BadgeTone> = {
  queued: "muted",
  running: "accent",
  completed: "success",
  failed: "danger",
  skipped: "muted",
  cancelled: "muted",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const initialState: ActionState = {};

function CancelRunButton({ id }: { id: string }) {
  const [state, formAction, isPending] = useActionState(cancelWorkflowRunAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={isPending} className="text-xs font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg rounded-ds-sm px-2 py-1 disabled:opacity-60">
        {isPending ? "Cancelling…" : "Cancel"}
      </button>
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function RunsList({ runs, workflowNameById }: { runs: WorkflowRun[]; workflowNameById: Record<string, string> }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Once an enabled workflow's trigger fires for a real lead, conversation, or appointment, its execution history shows up here -- what ran, when, and why it succeeded or failed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center justify-between gap-3 rounded-ds-sm px-2 py-2 hover:bg-ds-surface-soft">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-ds-text-primary">{workflowNameById[run.workflow_id] ?? "Deleted workflow"}</span>
            <span className="text-xs text-ds-text-muted">
              {run.trigger_event.replace(/_/g, " ")} · step {run.next_step_index}/{run.steps.length} · {formatDate(run.created_at)}
            </span>
            {run.failure_reason ? <span className="text-xs text-ds-danger">{run.failure_reason}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[run.status]} size="sm">
              {run.status}
            </Badge>
            {run.status === "queued" || run.status === "running" ? <CancelRunButton id={run.id} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
