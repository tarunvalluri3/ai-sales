"use client";

import { useActionState } from "react";
import { Camera } from "lucide-react";
import { chooseInstagramAccountAction, type InstagramActionState } from "./actions";

const initialState: InstagramActionState = {};

/** Shown when the client shared more than one Instagram account during Meta's login. */
export function ChooseInstagramAccount({
  selectionId,
  accounts,
  onboarding = false,
}: {
  selectionId: string;
  onboarding?: boolean;
  accounts: { id: string; username: string | null; pageName?: string | null }[];
}) {
  const [state, formAction, isPending] = useActionState(chooseInstagramAccountAction, initialState);

  return (
    <section className="dx-card flex flex-col gap-4 dx-card-pad">
      <div className="flex flex-col gap-1">
        <h2 className="dx-title">Choose the Instagram account for this business</h2>
        <p className="text-sm text-ds-text-secondary">
          You shared {accounts.length} Instagram accounts with Waves AI Pilot. Pick the one whose DMs your AI sales
          employee should answer.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        {onboarding ? <input type="hidden" name="from" value="onboarding" /> : null}
        <input type="hidden" name="selectionId" value={selectionId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Instagram account</legend>
          {accounts.map((account, index) => (
            <label
              key={account.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-ds-border-strong px-4 py-3 text-sm text-ds-text-primary has-[:checked]:border-ds-accent has-[:checked]:bg-ds-lime-soft"
            >
              <input type="radio" name="accountId" value={account.id} defaultChecked={index === 0} required />
              <Camera strokeWidth={1.75} className="size-4 text-ds-text-muted" aria-hidden="true" />
              <span className="flex flex-col">
                <span>{account.username ? `@${account.username}` : `Instagram account ${account.id}`}</span>
                {account.pageName ? (
                  <span className="text-xs text-ds-text-muted">Facebook Page: {account.pageName}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={isPending}
          className="ds-btn-label inline-flex h-9 w-fit items-center gap-2 rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {isPending ? "Connecting…" : "Connect this account"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
