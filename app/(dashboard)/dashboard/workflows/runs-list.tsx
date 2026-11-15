"use client";

import { useActionState } from "react";
import { cancelWorkflowRunAction, type ActionState } from "./actions";
import { Zap } from "lucide-react";
import { Pill, type PillTone } from "../_components/ui";
import type { WorkflowRun, WorkflowRunStatus } from "@/lib/supabase/types";

const STATUS_TONE: Record<WorkflowRunStatus, PillTone> = {
  queued: "amber",
  running: "lime",
  completed: "lime",
  failed: "red",
  skipped: "gray",
  cancelled: "gray",
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
      <button type="submit" disabled={isPending} className="rounded-md text-xs font-medium text-ds-primary underline-offset-4 hover:underline disabled:opacity-60">
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
      <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
        No runs yet. Once an enabled workflow&rsquo;s trigger fires for a real lead, conversation or appointment, its
        execution history shows up here: what ran, when, and why it succeeded or failed.
      </p>
    );
  }

  return (
    <ul className="dx-rows flex flex-col">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <Zap className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-ds-text-primary">{workflowNameById[run.workflow_id] ?? "Deleted workflow"}</span>
            {run.failure_reason ? <span className="text-xs text-ds-text-secondary">{run.failure_reason}</span> : null}
          </div>
          <span className="text-sm text-ds-text-secondary">
            {formatDate(run.created_at)} · Step {run.next_step_index}/{run.steps.length}
          </span>
          <Pill tone={STATUS_TONE[run.status]} size="sm" className="font-medium capitalize">
            {run.status}
          </Pill>
          {run.status === "queued" || run.status === "running" ? <CancelRunButton id={run.id} /> : null}
        </li>
      ))}
    </ul>
  );
}
