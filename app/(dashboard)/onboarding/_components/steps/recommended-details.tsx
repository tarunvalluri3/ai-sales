"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { saveOptionalDetailsAction, type OptionalDetailsState } from "../../actions";
import { Card, CardHeader, btnOutline, inputClass } from "../../../dashboard/_components/ui";

const initialState: OptionalDetailsState = {};

/**
 * The recommended (never blocking) details the readiness checklist asks for,
 * editable right here so the owner doesn't have to leave the wizard -- the
 * dashboard pages that normally hold them aren't reachable before publishing.
 */
export function RecommendedDetails({
  website,
  privacyPolicyUrl,
}: {
  website: string | null;
  privacyPolicyUrl: string | null;
}) {
  const [state, formAction, isPending] = useActionState(saveOptionalDetailsAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader title="Recommended details" description="You can add these now or update them later in the dashboard." />

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rd-website" className="text-sm font-medium text-ds-text-primary">
            Website
          </label>
          <input
            id="rd-website"
            name="website"
            type="url"
            defaultValue={website ?? ""}
            placeholder="e.g. https://example.com"
            disabled={isPending}
            aria-invalid={fieldErrors.website ? true : undefined}
            className={inputClass}
          />
          {fieldErrors.website ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.website}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rd-privacy" className="text-sm font-medium text-ds-text-primary">
            Your privacy policy URL
          </label>
          <input
            id="rd-privacy"
            name="privacyPolicyUrl"
            type="url"
            defaultValue={privacyPolicyUrl ?? ""}
            placeholder="https://example.com/privacy"
            disabled={isPending}
            aria-describedby="rd-privacy-help"
            aria-invalid={fieldErrors.privacyPolicyUrl ? true : undefined}
            className={inputClass}
          />
          <p id="rd-privacy-help" className="text-xs text-ds-text-muted">
            The chat widget&rsquo;s consent notice links here. Must start with https://.
          </p>
          {fieldErrors.privacyPolicyUrl ? (
            <p role="alert" className="text-xs text-ds-danger">{fieldErrors.privacyPolicyUrl}</p>
          ) : null}
        </div>

        {state.error && !state.fieldErrors ? (
          <p role="alert" className="text-sm text-ds-danger">{state.error}</p>
        ) : null}
        {state.success ? (
          <p role="status" className="text-sm text-ds-success">Saved.</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className={btnOutline + " min-h-11 self-start"}
        >
          {isPending ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : null}
          {isPending ? "Saving…" : "Save details"}
        </button>
      </form>

    </Card>
  );
}
