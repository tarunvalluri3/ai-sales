"use client";

import { useActionState, useState, type FormEvent } from "react";
import { createSalesTaskAction, setSalesTaskStatusAction, type ActionState } from "./actions";
import { EmptyState } from "../_components/state-views";
import type { SalesTask } from "@/lib/supabase/types";

const initialState: ActionState = {};

function NewTaskForm() {
  const [state, formAction, isPending] = useActionState(createSalesTaskAction, initialState);
  const [title, setTitle] = useState("");

  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) setTitle("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!title.trim()) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New task"
        maxLength={200}
        disabled={isPending}
        className="flex-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 text-xs text-ds-text-primary transition-colors focus:border-ds-accent focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isPending || !title.trim()}
        className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function TaskRow({ task }: { task: SalesTask }) {
  const [state, formAction, isPending] = useActionState(setSalesTaskStatusAction, initialState);
  const isOpen = task.status === "open";

  return (
    <div className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 hover:bg-ds-surface-soft">
      <div className="flex flex-col">
        <span className={`text-sm ${isOpen ? "text-ds-text-primary" : "text-ds-text-muted line-through"}`}>{task.title}</span>
        {task.workflow_run_id ? <span className="text-2xs text-ds-text-muted">Created by a workflow</span> : null}
      </div>
      {isOpen ? (
        <form action={formAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={task.id} />
          <button type="submit" name="status" value="done" disabled={isPending} className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-success transition-colors hover:bg-ds-success-bg disabled:opacity-60">
            Done
          </button>
          <button type="submit" name="status" value="dismissed" disabled={isPending} className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60">
            Dismiss
          </button>
          {state.error ? (
            <span role="alert" className="sr-only">
              {state.error}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export function TasksPanel({ tasks, canEdit }: { tasks: SalesTask[]; canEdit: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <h2 className="text-sm font-semibold text-ds-text-primary">Sales tasks</h2>
      {canEdit ? <NewTaskForm /> : null}
      {tasks.length === 0 ? (
        <EmptyState title="No tasks" description="Manually-created tasks and workflow-created tasks both show up here." />
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}
