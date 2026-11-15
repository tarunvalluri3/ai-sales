"use client";

import { useActionState, useState } from "react";
import type { WhatsappConnection } from "@/lib/supabase/types";
import { disconnectWhatsappAction, type WhatsappActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { ConnectWhatsappForm } from "./connect-whatsapp-form";
import { BadgeCheck, CalendarDays, Info, KeyRound, Link2 } from "lucide-react";
import { Pill, btnDangerSm, btnGhostSm, btnText, type PillTone } from "../_components/ui";
import { onboardingFailureMessage, type OnboardingFailureCode } from "@/lib/whatsapp-embedded-signup-rules";
import { FinishSetupButton } from "./finish-setup-button";

const SETUP_FAILURE_CODES: readonly OnboardingFailureCode[] = [
  "exchange_failed",
  "phone_not_in_waba",
  "phone_lookup_failed",
  "subscribe_failed",
  "register_failed",
  "register_rate_limited",
  "register_pin_mismatch",
];

const initialState: WhatsappActionState = {};

const STATUS_LABEL: Record<WhatsappConnection["status"], string> = {
  connected: "Connected",
  pending: "Pending",
  error: "Error",
  disconnected: "Disconnected",
};

const STATUS_TONE: Record<WhatsappConnection["status"], PillTone> = {
  connected: "lime",
  pending: "gray",
  error: "red",
  disconnected: "gray",
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
  // Production readiness item 6: a number connected through Embedded Signup
  // whose automatic setup stopped at a step shows that step's message and a
  // "Finish setup" retry instead of the manual-token wording.
  const viaSignup = connection.onboarding_method === "embedded_signup";
  const setupFailure =
    viaSignup && connection.setup_error && (SETUP_FAILURE_CODES as readonly string[]).includes(connection.setup_error)
      ? (connection.setup_error as OnboardingFailureCode)
      : null;

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
    <section className="dx-card flex h-full flex-col gap-4 dx-card-pad">
      <div className="flex flex-col gap-2">
        <p className="ds-section-label">Business number</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="text-sm leading-tight font-medium text-ds-text-primary">
            {connection.display_phone_number}
          </p>
          <Pill tone={STATUS_TONE[connection.status]} dot className="h-8 px-3.5 font-medium">
            {STATUS_LABEL[connection.status]}
          </Pill>
        </div>
        {connection.verified_name ? (
          <p className="flex items-center gap-2 text-xs font-medium text-ds-text-primary">
            {connection.verified_name}
            <BadgeCheck strokeWidth={1.75} className="size-5 text-ds-success-bright" aria-hidden="true" />
          </p>
        ) : null}
      </div>

      <ul className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-ds-border pb-4 text-sm text-ds-text-primary">
        {viaSignup ? (
          <li className="flex items-center gap-3">
            <Link2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Connected with Facebook
          </li>
        ) : connection.access_token_last4 ? (
          <li className="flex items-center gap-3">
            <KeyRound className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Token ending in {connection.access_token_last4}
          </li>
        ) : null}
        {connection.connected_at ? (
          <li className="flex items-center gap-3">
            <CalendarDays className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Connected {new Date(connection.connected_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-3 text-sm text-ds-text-primary">
          <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          This number uses your shared business knowledge.
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={formAction}>
              <button
                type="submit"
                disabled={isPending}
                autoFocus
                className="inline-flex h-9 items-center rounded-xl bg-ds-danger px-4 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
              >
                {isPending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
            </form>
            <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className={btnText}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {viaSignup ? null : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={!canEdit}
                title={canEdit ? undefined : ROLE_DENIED_TITLE}
                className={btnGhostSm}
              >
                Edit connection
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={btnDangerSm}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-ds-text-secondary">
        {confirming
          ? "This disconnects WhatsApp. Prospects won’t reach your AI sales employee there until you reconnect."
          : "Disconnecting stops new WhatsApp conversations here. Past conversations remain available."}
      </p>

      {setupFailure ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
            {onboardingFailureMessage(setupFailure)}
          </p>
          {canEdit ? <FinishSetupButton /> : null}
        </div>
      ) : connection.status === "error" && connection.last_error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {describeConnectionError(connection.last_error)}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
