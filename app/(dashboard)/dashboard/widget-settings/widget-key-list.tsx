"use client";

import { useActionState, useState } from "react";
import type { WidgetKey } from "@/lib/supabase/types";
import { updateWidgetKeyOriginsAction, revokeWidgetKeyAction, type WidgetKeyActionState } from "./actions";
import { CopyKeyButton } from "./copy-key-button";
import { buildWidgetSnippet } from "./build-widget-snippet";
import { EmptyState } from "../_components/state-views";

const initialState: WidgetKeyActionState = {};

function WidgetKeyCard({ widgetKey, appOrigin }: { widgetKey: WidgetKey; appOrigin: string }) {
  const [origins, setOrigins] = useState(widgetKey.allowed_origins.join("\n"));
  const [updateState, updateAction, updatePending] = useActionState(updateWidgetKeyOriginsAction, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeWidgetKeyAction, initialState);
  const isRevoked = widgetKey.status === "revoked";
  const snippet = buildWidgetSnippet(widgetKey.key, appOrigin);

  return (
    <div className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <code className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2 font-mono text-sm text-ds-text-primary">
            {widgetKey.key}
          </code>
          <CopyKeyButton value={widgetKey.key} label="Copy key" />
          {!isRevoked ? <CopyKeyButton value={snippet} label="Copy snippet" /> : null}
        </div>
        <span
          className={`rounded-ds-sm px-2.5 py-1 text-2xs font-semibold tracking-wide-ds uppercase ${
            isRevoked ? "bg-ds-surface-soft text-ds-text-muted" : "bg-ds-success-bg text-ds-success"
          }`}
        >
          {widgetKey.status}
        </span>
      </div>

      <p className="text-xs text-ds-text-muted">
        Created {new Date(widgetKey.created_at).toLocaleString()}
        {widgetKey.revoked_at ? ` · Revoked ${new Date(widgetKey.revoked_at).toLocaleString()}` : ""}
      </p>

      {isRevoked ? (
        <p className="text-xs text-ds-text-secondary">
          Origins at time of revocation: {widgetKey.allowed_origins.join(", ") || "none"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <form id={`update-origins-${widgetKey.id}`} action={updateAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={widgetKey.id} />
            <label
              htmlFor={`origins-${widgetKey.id}`}
              className="text-xs font-medium text-ds-text-muted uppercase tracking-wide-ds"
            >
              Allowed origins (one per line)
            </label>
            <textarea
              id={`origins-${widgetKey.id}`}
              name="origins"
              rows={2}
              value={origins}
              onChange={(event) => setOrigins(event.target.value)}
              disabled={updatePending}
              placeholder="https://example.com"
              className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
            />
            {updateState.error ? (
              <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
                {updateState.error}
              </p>
            ) : null}
            {updateState.success ? (
              <p className="rounded-ds-sm bg-ds-success-bg px-3 py-2 text-xs text-ds-success">Saved.</p>
            ) : null}
          </form>
          {/* Two sibling <form>s, not nested (HTML forbids a <form> inside a
             <form>) -- the save button uses the HTML5 `form` attribute to
             submit the origins form above it despite living outside it. */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form={`update-origins-${widgetKey.id}`}
              disabled={updatePending}
              className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
            >
              {updatePending ? "Saving…" : "Save origins"}
            </button>

            <form action={revokeAction}>
              <input type="hidden" name="id" value={widgetKey.id} />
              <button
                type="submit"
                disabled={revokePending}
                className="rounded-ds-md border border-ds-danger px-4 py-2 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60"
              >
                {revokePending ? "Revoking…" : "Revoke"}
              </button>
            </form>
          </div>
          {revokeState.error ? (
            <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
              {revokeState.error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function WidgetKeyList({ widgetKeys, appOrigin }: { widgetKeys: WidgetKey[]; appOrigin: string }) {
  if (widgetKeys.length === 0) {
    return <EmptyState title="No widget keys yet" description="Create one above to get started." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {widgetKeys.map((widgetKey) => (
        <WidgetKeyCard key={widgetKey.id} widgetKey={widgetKey} appOrigin={appOrigin} />
      ))}
    </div>
  );
}
