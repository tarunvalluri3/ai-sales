"use client";

import { useActionState, useState } from "react";
import type { WidgetKey } from "@/lib/supabase/types";
import { updateWidgetKeyOriginsAction, revokeWidgetKeyAction, type WidgetKeyActionState } from "./actions";
import { CopyKeyButton } from "./copy-key-button";
import { buildWidgetSnippet } from "./build-widget-snippet";
import { DeleteButton, ROLE_DENIED_TITLE } from "../_components/delete-button";
import { useBusinessTime } from "../_components/business-time";
import { Pill, btnPrimary, helpClass, inputClass, labelClass, textareaClass } from "../_components/ui";

const initialState: WidgetKeyActionState = {};

function WidgetKeyCard({
  widgetKey,
  appOrigin,
  canEdit = true,
}: {
  widgetKey: WidgetKey;
  appOrigin: string;
  canEdit?: boolean;
}) {
  const businessTime = useBusinessTime();
  const [origins, setOrigins] = useState(widgetKey.allowed_origins.join("\n"));
  const [name, setName] = useState(widgetKey.name ?? "");
  const [updateState, updateAction, updatePending] = useActionState(updateWidgetKeyOriginsAction, initialState);
  const isRevoked = widgetKey.status === "revoked";
  const snippet = buildWidgetSnippet(widgetKey.key, appOrigin);
  const hasNoOrigins = !isRevoked && widgetKey.allowed_origins.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ds-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-medium text-ds-text-primary">{widgetKey.name || "Unnamed key"}</span>
            <Pill tone={isRevoked ? "gray" : "lime"} dot size="sm" className="capitalize">
              {widgetKey.status}
            </Pill>
          </div>
          <p className="text-sm text-ds-text-secondary">
            Created {businessTime.dateTime(widgetKey.created_at)}
            {widgetKey.revoked_at ? ` · Revoked ${businessTime.dateTime(widgetKey.revoked_at)}` : ""}
            {" · "}
            {widgetKey.last_used_at ? `Last used ${businessTime.dateTime(widgetKey.last_used_at)}` : "Never used yet"}
          </p>
        </div>
        {!isRevoked ? <CopyKeyButton value={snippet} label="Copy snippet" /> : null}
      </div>

      {hasNoOrigins ? (
        <p role="status" className="rounded-xl bg-ds-warning-bg px-3 py-2 text-xs text-ds-warning">
          No allowed origins yet. This key will reject every chat request until you add one below.
        </p>
      ) : null}

      {isRevoked ? (
        <p className="text-sm text-ds-text-secondary">
          Origins at time of revocation: {widgetKey.allowed_origins.join(", ") || "none"}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <form id={`update-origins-${widgetKey.id}`} action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={widgetKey.id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`name-${widgetKey.id}`} className={labelClass}>
                Nickname
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
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`origins-${widgetKey.id}`} className={labelClass}>
                Allowed origins
              </label>
              <textarea
                id={`origins-${widgetKey.id}`}
                name="origins"
                rows={2}
                value={origins}
                onChange={(event) => setOrigins(event.target.value)}
                disabled={updatePending || !canEdit}
                placeholder="https://example.com"
                aria-describedby={`origins-hint-${widgetKey.id}`}
                className={`${textareaClass} font-mono`}
              />
              <p id={`origins-hint-${widgetKey.id}`} className={helpClass}>
                One address per line. No page paths or trailing slashes.
              </p>
            </div>
            {updateState.error ? (
              <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
                {updateState.error}
              </p>
            ) : null}
            {updateState.success ? (
              <p role="status" className="rounded-xl bg-ds-success-bg px-3 py-2 text-xs text-ds-success">
                Saved.
              </p>
            ) : null}
          </form>
          {/* Two sibling <form>s, not nested (HTML forbids a <form> inside a
             <form>) -- the save button uses the HTML5 `form` attribute to
             submit the origins form above it despite living outside it. */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              form={`update-origins-${widgetKey.id}`}
              disabled={updatePending || !canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className={`${btnPrimary} min-w-40 flex-1`}
            >
              {updatePending ? "Saving…" : "Save"}
            </button>

            <DeleteButton
              action={revokeWidgetKeyAction}
              id={widgetKey.id}
              label="Revoke key"
              canEdit={canEdit}
              confirmMessage="Any site using this key will stop getting chat responses immediately."
            />
          </div>
          <p className="text-sm text-ds-danger">Revoking immediately stops chat replies on sites using this key.</p>
        </div>
      )}
    </div>
  );
}

export function WidgetKeyList({
  widgetKeys,
  appOrigin,
  canEdit = true,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
  widgetLanguage?: string;
  canEdit?: boolean;
}) {
  if (widgetKeys.length === 0) {
    return (
      <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
        No widget keys yet. Create one below to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {widgetKeys.map((widgetKey) => (
        <WidgetKeyCard
          key={widgetKey.id}
          widgetKey={widgetKey}
          appOrigin={appOrigin}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
