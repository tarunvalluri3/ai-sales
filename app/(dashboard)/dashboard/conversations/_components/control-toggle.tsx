"use client";

import { useActionState } from "react";
import type { SetControlState } from "../actions";
import { setConversationControlAction } from "../actions";
import type { ConversationControl } from "@/lib/supabase/types";

const initialState: SetControlState = {};

export function ControlToggle({
  conversationId,
  control,
}: {
  conversationId: string;
  control: ConversationControl;
}) {
  const [state, formAction, isPending] = useActionState(setConversationControlAction, initialState);
  const nextControl: ConversationControl = control === "human" ? "ai" : "human";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          control === "human" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {control === "human" ? "Human-controlled" : "AI-handled"}
      </span>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={conversationId} />
        <input type="hidden" name="control" value={nextControl} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-dashboard-primary px-3 py-1.5 text-sm font-medium text-dashboard-on-primary hover:bg-dashboard-primary-hover disabled:opacity-60"
        >
          {control === "human" ? "Hand back to AI" : "Take over this conversation"}
        </button>
      </form>

      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
