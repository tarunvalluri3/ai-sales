"use client";

import { useActionState, useState } from "react";
import { Camera } from "lucide-react";
import type { InstagramConnection } from "@/lib/supabase/types";
import { Badge, type BadgeTone } from "../_components/badge";
import { disconnectInstagramAction, type InstagramActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

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

const TOKEN_WARNING_WINDOW_DAYS = 7;

/**
 * `last_error` is a raw string this app itself wrote (refreshInstagramToken()'s
 * caught-error branch, or a future producer) -- never render it verbatim,
 * same convention as WhatsApp's describeConnectionError().
 */
function describeConnectionError(lastError: string): string {
  const normalized = lastError.toLowerCase();
  if (normalized.includes("token") || normalized.includes("oauth")) {
    return "Your Instagram connection stopped working and needs to be reconnected.";
  }
  return "This connection stopped working and needs to be reconnected.";
}

function formatDaysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
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

  const daysUntilExpiry = connection.token_expires_at ? formatDaysUntil(connection.token_expires_at) : null;
  const showExpiryWarning =
    connection.status === "connected" && daysUntilExpiry !== null && daysUntilExpiry <= TOKEN_WARNING_WINDOW_DAYS;

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-ds-md bg-[linear-gradient(135deg,#feda75_0%,#fa7e1e_25%,#d62976_50%,#962fbf_75%,#4f5bd5_100%)] text-white"
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
              This disconnects Instagram — prospects won&rsquo;t reach your AI sales employee there until you
              reconnect.
            </span>
            <form action={formAction}>
              <button
                type="submit"
                disabled={isPending}
                autoFocus
                className="rounded-ds-sm bg-ds-danger px-2 py-1 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
              >
                {isPending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href="/api/oauth/instagram/authorize"
              aria-disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={`rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${!canEdit ? "pointer-events-none opacity-60" : ""}`}
            >
              Reconnect
            </a>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      {connection.status === "error" && connection.last_error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {describeConnectionError(connection.last_error)} Click &ldquo;Reconnect&rdquo; above to fix it.
        </p>
      ) : null}
      {showExpiryWarning ? (
        <p className="rounded-ds-sm bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          {daysUntilExpiry !== null && daysUntilExpiry > 0
            ? `Your connection needs to be refreshed within ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. This normally happens automatically — if you see this message linger, click "Reconnect."`
            : "Your connection needs to be refreshed. Click “Reconnect” above."}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
