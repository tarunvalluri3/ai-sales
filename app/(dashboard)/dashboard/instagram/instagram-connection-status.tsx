"use client";

import { useActionState, useState } from "react";
import { Camera, CheckSquare } from "lucide-react";
import type { InstagramConnection } from "@/lib/supabase/types";
import { Badge, type BadgeTone } from "../_components/badge";
import { disconnectInstagramAction, type InstagramActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { INSTAGRAM_CONNECT_PATH } from "./connect-path";
import { MESSAGE_ACCESS_HINT } from "./message-access-hint";

const initialState: InstagramActionState = {};

const STATUS_LABEL: Record<InstagramConnection["status"], string> = {
  connected: "Connected",
  pending: "Pending",
  error: "Error",
  disconnected: "Disconnected",
};

const STATUS_TONE: Record<InstagramConnection["status"], BadgeTone> = {
  connected: "success",
  pending: "muted",
  error: "danger",
  disconnected: "muted",
};

/**
 * Why a connection stopped, from the short code this app writes to
 * `last_error` (never Meta's raw text).
 */
function describeBrokenConnection(connection: InstagramConnection): string {
  switch (connection.last_error) {
    case "token_revoked":
      return "Meta says our access to this Instagram account was removed or is no longer valid, so we've stopped sending replies.";
    case "reconnect_required":
      return "We changed how Instagram connects. Reconnect once to keep answering Instagram DMs.";
    default:
      return "This Instagram connection stopped working, so we've stopped sending replies.";
  }
}

export function InstagramConnectionStatus({
  connection,
  canEdit,
}: {
  connection: InstagramConnection;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(disconnectInstagramAction, initialState);
  const [confirming, setConfirming] = useState(false);
  const broken = connection.status === "disconnected" || connection.status === "error";

  return (
    <section className="flex flex-col gap-4 border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center border border-ds-border bg-ds-surface-raised text-ds-text-primary"
          >
            <Camera className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-ds-text-primary">
                {connection.ig_username ? `@${connection.ig_username}` : "Instagram account"}
              </p>
              <Badge tone={STATUS_TONE[connection.status]} size="sm">
                {STATUS_LABEL[connection.status]}
              </Badge>
            </div>
            {connection.facebook_page_name ? (
              <p className="text-xs text-ds-text-muted">Through the Facebook Page {connection.facebook_page_name}</p>
            ) : null}
            {connection.connected_at ? (
              <p className="text-xs text-ds-text-muted">
                Connected {new Date(connection.connected_at).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
        {confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-ds-text-secondary">
              This removes our access to the account and stops replies there. Past conversations stay in your
              dashboard.
            </span>
            <form action={formAction}>
              <button
                type="submit"
                disabled={isPending}
                autoFocus
                className="bg-ds-danger px-2 py-1 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
              >
                {isPending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href={INSTAGRAM_CONNECT_PATH}
              aria-disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={`px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary ${!canEdit ? "pointer-events-none opacity-60" : ""}`}
            >
              Reconnect
            </a>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      {connection.status === "connected" ? (
        <div className="flex items-start gap-2 bg-ds-surface-soft px-3 py-2 text-xs text-ds-text-secondary">
          <CheckSquare aria-hidden="true" className="mt-px size-3.5 shrink-0 text-ds-text-muted" />
          <p>
            <span className="font-medium text-ds-text-primary">Not getting DMs? Check message access.</span>{" "}
            {MESSAGE_ACCESS_HINT}
          </p>
        </div>
      ) : null}
      {broken ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          <span>{describeBrokenConnection(connection)}</span>
          {canEdit ? (
            <a
              href={INSTAGRAM_CONNECT_PATH}
              className="ds-btn-label bg-ds-primary px-3 py-1.5 font-medium text-ds-primary-on hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
            >
              Reconnect Instagram
            </a>
          ) : null}
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
