"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Camera, Flag, Info, RefreshCw } from "lucide-react";
import type { InstagramConnection } from "@/lib/supabase/types";
import { Pill, btnDanger, btnPrimary, btnPrimarySm, btnText, type PillTone } from "../_components/ui";
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

const STATUS_TONE: Record<InstagramConnection["status"], PillTone> = {
  connected: "lime",
  pending: "gray",
  error: "red",
  disconnected: "gray",
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
    <>
      <section className="dx-card flex flex-col gap-4 dx-card-pad">
        <p className="ds-section-label">Connected account</p>
        <div className="flex flex-wrap items-center gap-5">
          <div aria-hidden="true" className="flex size-24 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-primary">
            <Camera className="size-11" strokeWidth={1.5} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="text-sm leading-tight font-medium break-all text-ds-text-primary">
                {connection.ig_username ? `@${connection.ig_username}` : "Instagram account"}
              </p>
              <Pill tone={STATUS_TONE[connection.status]} dot className="h-8 px-3.5 font-medium">
                {STATUS_LABEL[connection.status]}
              </Pill>
            </div>
            {connection.facebook_page_name ? (
              <p className="text-base text-ds-text-secondary">{connection.facebook_page_name}</p>
            ) : null}
          </div>
        </div>

        <dl className="flex flex-col gap-2.5 border-y border-ds-border py-4 text-sm text-ds-text-primary">
          {connection.facebook_page_name ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4">
              <Flag className="size-5" strokeWidth={1.75} aria-hidden="true" />
              <dt>Facebook Page</dt>
              <dd className="border-l border-ds-border pl-6 font-medium">{connection.facebook_page_name}</dd>
            </div>
          ) : null}
          {connection.connected_at ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4">
              <CalendarDays className="size-5" strokeWidth={1.75} aria-hidden="true" />
              <dt>Connected on</dt>
              <dd className="border-l border-ds-border pl-6 font-medium">
                {new Date(connection.connected_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="text-sm text-ds-text-secondary">Your AI uses the same approved knowledge as your website and WhatsApp.</p>

        {confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={formAction}>
              <button
                type="submit"
                disabled={isPending}
                autoFocus
                className="inline-flex h-10 items-center rounded-xl bg-ds-danger px-5 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
              >
                {isPending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
            </form>
            <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className={btnText}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={INSTAGRAM_CONNECT_PATH}
              aria-disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={`${btnPrimary} min-w-52 ${!canEdit ? "pointer-events-none opacity-60" : ""}`}
            >
              <RefreshCw className="size-5" strokeWidth={1.75} aria-hidden="true" />
              Reconnect
            </a>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={`${btnDanger} min-w-52`}
            >
              Disconnect
            </button>
          </div>
        )}
        <p className="text-sm text-ds-text-secondary">
          {confirming
            ? "This removes our access to the account and stops replies there. Past conversations stay in your dashboard."
            : "Past conversations stay in your dashboard if you disconnect."}
        </p>

        {broken ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ds-danger-bg px-4 py-3 text-xs text-ds-danger">
            <span>{describeBrokenConnection(connection)}</span>
            {canEdit ? (
              <a href={INSTAGRAM_CONNECT_PATH} className={btnPrimarySm}>
                Reconnect Instagram
              </a>
            ) : null}
          </div>
        ) : null}
        {state.error ? (
          <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
            {state.error}
          </p>
        ) : null}
      </section>

      {connection.status === "connected" ? (
        <div className="flex items-start gap-4 rounded-3xl bg-ds-surface-soft px-5 py-4">
          <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} />
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium text-ds-text-primary">Not getting DMs?</p>
            <p className="text-sm leading-relaxed text-ds-text-secondary">Check message access. {MESSAGE_ACCESS_HINT}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
