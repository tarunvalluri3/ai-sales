"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { connectWhatsappAction, type WhatsappActionState } from "./actions";

const initialState: WhatsappActionState = {};

const inputClasses =
  "w-full rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60 aria-invalid:border-ds-danger";

const linkClasses = "text-ds-text-secondary underline underline-offset-2 hover:text-ds-text-primary";

/** WhatsApp Manager's Phone numbers page — where phone_number_id, the WABA ID, and the display number are all shown together. */
export const WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/phone-numbers/";
/** Business Settings' System Users page — where a permanent (non-expiring) access token is generated, as opposed to the 24-hour token the API Setup page shows by default. */
export const SYSTEM_USERS_URL = "https://business.facebook.com/settings/system-users";
/** Meta Business Manager root — for a signed-in user with no Business account yet, this triggers Meta's own account-creation flow. */
export const BUSINESS_MANAGER_URL = "https://business.facebook.com/";
/** Meta for Developers' "My Apps" listing — where "Create App" starts, to add the WhatsApp product. */
export const DEVELOPER_APPS_URL = "https://developers.facebook.com/apps/";

type FieldName = "phoneNumberId" | "wabaId" | "displayPhoneNumber" | "accessToken";

const FIELDS: Array<{
  name: FieldName;
  label: string;
  placeholder: string;
  type: "text" | "password";
  autoComplete?: string;
  hint: ReactNode;
}> = [
  {
    name: "phoneNumberId",
    label: "Phone number ID",
    placeholder: "109876543212345",
    type: "text",
    hint: (
      <>
        In{" "}
        <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noreferrer" className={linkClasses}>
          WhatsApp Manager
        </a>
        , next to your number — not the phone number itself.
      </>
    ),
  },
  {
    name: "wabaId",
    label: "WhatsApp Business Account ID",
    placeholder: "123456789012345",
    type: "text",
    hint: "On the same WhatsApp Manager page, under your account details.",
  },
  {
    name: "displayPhoneNumber",
    label: "Phone number",
    placeholder: "+1 555 010 1234",
    type: "text",
    hint: "The number prospects will message, in international format.",
  },
  {
    name: "accessToken",
    label: "Access token",
    placeholder: "EAAG...",
    type: "password",
    autoComplete: "off",
    hint: (
      <>
        A permanent token from a{" "}
        <a href={SYSTEM_USERS_URL} target="_blank" rel="noreferrer" className={linkClasses}>
          system user
        </a>{" "}
        with WhatsApp messaging access — the default token on Meta&rsquo;s API Setup page expires in 24 hours.
      </>
    ),
  },
];

export function ConnectWhatsappForm({
  defaultValues,
  onSuccess,
  onCancel,
}: {
  /** Non-secret values from an existing connection, to pre-fill when reconnecting. Omit for a first-time connect. */
  defaultValues?: { phoneNumberId: string; wabaId: string; displayPhoneNumber: string };
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(connectWhatsappAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const isReconnect = Boolean(defaultValues);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSuccess is a fresh closure each render; only re-run when the action result changes.
  }, [state.success]);

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-ds-text-primary">
          {isReconnect ? "Update your WhatsApp connection" : "Connect a WhatsApp number"}
        </h2>
        <p className="text-xs text-ds-text-muted">
          {isReconnect
            ? "Your phone number ID, business account ID, and phone number are pre-filled. Enter a fresh access token to reconnect."
            : "Each field below links to exactly where to find it in Meta Business Manager."}
        </p>
      </div>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        {FIELDS.map((field) => {
          const fieldError = state.fieldErrors?.[field.name];
          const errorId = `${field.name}-error`;
          return (
            <div key={field.name} className="flex flex-col gap-1">
              <label htmlFor={field.name} className="text-xs font-medium text-ds-text-secondary">
                {field.label}
              </label>
              <p id={`${field.name}-hint`} className="text-xs text-ds-text-muted">
                {field.hint}
              </p>
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                required
                disabled={isPending}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                defaultValue={field.name === "accessToken" ? undefined : defaultValues?.[field.name]}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${field.name}-hint ${errorId}` : `${field.name}-hint`}
                className={inputClasses}
              />
              {fieldError ? (
                <p id={errorId} role="alert" className="text-xs text-ds-danger">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        })}
        <div className="mt-1 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 self-start rounded-ds-md bg-ds-accent px-4 py-2.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
          >
            {isPending ? "Connecting…" : isReconnect ? "Save" : "Connect"}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {state.error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
