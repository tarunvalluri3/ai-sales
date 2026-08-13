"use client";

import { useActionState } from "react";
import type { ProfileFormState } from "./actions";
import { updateBusinessProfileAction } from "./actions";

const initialState: ProfileFormState = {};

export function ProfileForm({
  initialName,
  initialDescription,
  initialContactEmail,
  initialContactPhone,
  initialWebsite,
}: {
  initialName: string;
  initialDescription: string;
  initialContactEmail: string;
  initialContactPhone: string;
  initialWebsite: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-zinc-900">
          Business name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          defaultValue={initialName}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-zinc-900">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={initialDescription}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="contactEmail" className="text-sm font-medium text-zinc-900">
          Contact email (optional)
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          placeholder="hello@example.com"
          defaultValue={initialContactEmail}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="contactPhone" className="text-sm font-medium text-zinc-900">
          Contact phone (optional)
        </label>
        <input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          placeholder="+1 555 123 4567"
          defaultValue={initialContactPhone}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="website" className="text-sm font-medium text-zinc-900">
          Website (optional)
        </label>
        <input
          id="website"
          name="website"
          type="url"
          placeholder="https://example.com"
          defaultValue={initialWebsite}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">Profile updated.</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-dashboard-primary px-3 py-2 text-sm font-medium text-dashboard-on-primary hover:bg-dashboard-primary-hover disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
