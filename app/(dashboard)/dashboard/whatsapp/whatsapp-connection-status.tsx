"use client";

import { useActionState, useState } from "react";
import type { WhatsappConnection } from "@/lib/supabase/types";
import { disconnectWhatsappAction, type WhatsappActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { ConnectWhatsappForm } from "./connect-whatsapp-form";

const initialState: WhatsappActionState = {};

const STATUS_LABEL: Record<WhatsappConnection["status"], string> = {
  connected: "Connected",
  pending: "Pending",
  error: "Error",
  disconnected: "Disconnected",
};

const STATUS_CLASSES: Record<WhatsappConnection["status"], string> = {
  connected: "bg-ds-success-bg text-ds-success",
  pending: "bg-ds-surface-elevated text-ds-text-secondary",
  error: "bg-ds-danger-bg text-ds-danger",
  disconnected: "bg-ds-surface-elevated text-ds-text-muted",
};

/**
 * `last_error` is a raw string written by whatever process next detects this
 * connection is broken (no producer exists yet, but the column and this
 * status both predate one -- see STATE.md). Never render it verbatim: it may
 * carry Meta API detail no business owner should have to parse. Map the
 * substrings a Meta Cloud API failure would actually contain to specific,
 * actionable copy; anything unrecognized still gets a safe, actionable
 * fallback rather than the raw text.
 */
function describeConnectionError(lastError: string): string {
  const normalized = lastError.toLowerCase();
  if (normalized.includes("token")) {
    return "Your access token no longer works. Click “Edit connection” and enter a new one from Meta Business Manager.";
  }
  if (normalized.includes("phone number") || normalized.includes("phone_number")) {
    return "Meta no longer recognizes this phone number configuration. Click “Edit connection” to update it.";
  }
  return "This connection stopped working and needs to be reconnected. Click “Edit connection” to fix it.";
}

export function WhatsappConnectionStatus({
  connection,
  canEdit,
}: {
  connection: WhatsappConnection;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(disconnectWhatsappAction, initialState);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <ConnectWhatsappForm
        defaultValues={{
          phoneNumberId: connection.phone_number_id,
          wabaId: connection.waba_id,
          displayPhoneNumber: connection.display_phone_number,
        }}
        onSuccess={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ds-text-primary">{connection.display_phone_number}</p>
            <span className={`rounded-ds-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[connection.status]}`}>
              {STATUS_LABEL[connection.status]}
            </span>
          </div>
          {connection.verified_name ? (
            <p className="text-xs text-ds-text-muted">{connection.verified_name}</p>
          ) : null}
          {connection.connected_at ? (
            <p className="text-xs text-ds-text-muted">
              Connected {new Date(connection.connected_at).toLocaleString()}
            </p>
          ) : null}
          {connection.access_token_last4 ? (
            <p className="text-xs text-ds-text-muted">Token ending in {connection.access_token_last4}</p>
          ) : null}
        </div>
        {confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-ds-text-secondary">
              This disconnects WhatsApp — prospects won&rsquo;t reach your AI sales employee there until you
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
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Edit connection
            </button>
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
          {describeConnectionError(connection.last_error)}
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
