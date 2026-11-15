"use client";

import { useActionState, useState, type FormEvent } from "react";
import { createSalesTaskAction, setSalesTaskStatusAction, type ActionState } from "./actions";
import { Plus, SquareCheckBig } from "lucide-react";
import { Card } from "../_components/ui";
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
        placeholder="New task…"
        aria-label="New task"
        maxLength={200}
        disabled={isPending}
        className="h-10 min-h-0 min-w-0 flex-1 rounded-xl border border-ds-border-strong bg-ds-surface px-3 text-sm text-ds-text-primary disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isPending || !title.trim()}
        aria-label={isPending ? "Adding task" : "Add task"}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ds-primary text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <Plus strokeWidth={1.75} className="size-5" aria-hidden="true" />
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
    <div className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-[0.3rem] border-2 ${isOpen ? "border-ds-text-primary" : "border-ds-border-strong bg-ds-surface-soft"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm font-medium ${isOpen ? "text-ds-text-primary" : "text-ds-text-muted line-through"}`}>{task.title}</span>
        {task.workflow_run_id ? <span className="text-sm text-ds-text-secondary">Created by a workflow</span> : null}
      </div>
      {isOpen ? (
        <form action={formAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={task.id} />
          <button type="submit" name="status" value="done" disabled={isPending} className="rounded-lg px-2 py-1 text-xs font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60">
            Done
          </button>
          <button type="submit" name="status" value="dismissed" disabled={isPending} className="rounded-lg px-2 py-1 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60">
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
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="dx-title flex items-center gap-3">
        <SquareCheckBig className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Sales tasks
      </h2>
      {canEdit ? <NewTaskForm /> : null}
      {tasks.length === 0 ? (
        <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
          No tasks. Manually-created tasks and workflow-created tasks both show up here.
        </p>
      ) : (
        <div className="dx-rows flex flex-col">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </Card>
  );
}
