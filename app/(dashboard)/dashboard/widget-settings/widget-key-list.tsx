"use client";

import { useActionState, useState } from "react";
import type { WidgetKey } from "@/lib/supabase/types";
import { updateWidgetKeyOriginsAction, revokeWidgetKeyAction, type WidgetKeyActionState } from "./actions";
import { CopyKeyButton } from "./copy-key-button";
import { buildWidgetSnippet } from "./build-widget-snippet";
import { EmptyState } from "../_components/state-views";
import { DeleteButton, ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: WidgetKeyActionState = {};

function formatDate(value: string, widgetLanguage: string): string {
  return new Intl.DateTimeFormat(widgetLanguage, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function WidgetKeyCard({
  widgetKey,
  appOrigin,
  widgetLanguage,
  canEdit = true,
}: {
  widgetKey: WidgetKey;
  appOrigin: string;
  widgetLanguage: string;
  canEdit?: boolean;
}) {
  const [origins, setOrigins] = useState(widgetKey.allowed_origins.join("\n"));
  const [name, setName] = useState(widgetKey.name ?? "");
  const [updateState, updateAction, updatePending] = useActionState(updateWidgetKeyOriginsAction, initialState);
  const isRevoked = widgetKey.status === "revoked";
  const snippet = buildWidgetSnippet(widgetKey.key, appOrigin);
  const hasNoOrigins = !isRevoked && widgetKey.allowed_origins.length === 0;

  return (
    <div className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ds-text-primary">{widgetKey.name || "Unnamed key"}</span>
          <div className="flex items-center gap-2">
            <code className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2 font-mono text-sm text-ds-text-primary">
              {widgetKey.key}
            </code>
            <CopyKeyButton value={widgetKey.key} label="Copy key" />
            {!isRevoked ? <CopyKeyButton value={snippet} label="Copy snippet" /> : null}
          </div>
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
        Created {formatDate(widgetKey.created_at, widgetLanguage)}
        {widgetKey.revoked_at ? ` · Revoked ${formatDate(widgetKey.revoked_at, widgetLanguage)}` : ""}
        {" · "}
        {widgetKey.last_used_at ? `Last used ${formatDate(widgetKey.last_used_at, widgetLanguage)}` : "Never used yet"}
      </p>

      {hasNoOrigins ? (
        <p role="status" className="rounded-ds-sm bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          No allowed origins yet — this key will reject every chat request until you add one below.
        </p>
      ) : null}

      {isRevoked ? (
        <p className="text-xs text-ds-text-secondary">
          Origins at time of revocation: {widgetKey.allowed_origins.join(", ") || "none"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <form id={`update-origins-${widgetKey.id}`} action={updateAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={widgetKey.id} />
            <label
              htmlFor={`name-${widgetKey.id}`}
              className="text-xs font-medium text-ds-text-muted uppercase tracking-wide-ds"
            >
              Nickname (optional, e.g. &ldquo;Marketing site&rdquo;)
            </label>
            <input
              id={`name-${widgetKey.id}`}
              name="name"
              type="text"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={updatePending || !canEdit}
              placeholder="Marketing site"
              className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
            />
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
              disabled={updatePending || !canEdit}
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
              disabled={updatePending || !canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
            >
              {updatePending ? "Saving…" : "Save"}
            </button>

            <DeleteButton
              action={revokeWidgetKeyAction}
              id={widgetKey.id}
              label="Revoke"
              canEdit={canEdit}
              confirmMessage="Any site using this key will stop getting chat responses immediately."
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function WidgetKeyList({
  widgetKeys,
  appOrigin,
  widgetLanguage = "en",
  canEdit = true,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
  widgetLanguage?: string;
  canEdit?: boolean;
}) {
  if (widgetKeys.length === 0) {
    return <EmptyState title="No widget keys yet" description="Create one above to get started." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {widgetKeys.map((widgetKey) => (
        <WidgetKeyCard
          key={widgetKey.id}
          widgetKey={widgetKey}
          appOrigin={appOrigin}
          widgetLanguage={widgetLanguage}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
