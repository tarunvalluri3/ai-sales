"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ImageIcon, Plus } from "lucide-react";
import type { ProductFormState } from "./actions";

const initialState: ProductFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60";
const labelClasses = "text-sm font-medium text-ds-text-primary";
const hintClasses = "text-xs text-ds-text-secondary";

export function ProductForm({
  action,
  id,
  initialName = "",
  initialDescription = "",
  initialPrice = "",
  initialImageUrl = "",
  initialCategory = "",
  initialPriceAmount = "",
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  action: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  id?: string;
  initialName?: string;
  initialDescription?: string;
  initialPrice?: string;
  initialImageUrl?: string;
  initialCategory?: string;
  initialPriceAmount?: string;
  submitLabel: string;
  pendingLabel: string;
  /** Called once after a successful submit, in addition to the existing reset-on-add behavior -- lets a caller editing in place (no navigation to a dedicated edit page) know when to exit edit mode. */
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Display only: mirrors what is typed into the (uncontrolled) Image URL
  // field so the preview box can show it before saving.
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl);
  const [previewFailed, setPreviewFailed] = useState(false);

  // A successful add resets the form, so clear the preview with it. Adjusted
  // during render (keyed on the action result) rather than in an effect.
  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success && !id) {
      setPreviewUrl("");
      setPreviewFailed(false);
    }
  }

  useEffect(() => {
    if (state.success) {
      if (!id) formRef.current?.reset();
      onSuccess?.();
    }
  }, [state.success, id, onSuccess]);

  const canPreview = /^https?:\/\//.test(previewUrl) && !previewFailed;

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3.5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={labelClasses}>
          Name <span className="text-ds-danger">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={120}
          placeholder="e.g. Website Starter Kit"
          defaultValue={initialName}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClasses}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Describe what’s included and who it’s for"
          defaultValue={initialDescription}
          disabled={isPending}
          className={`${inputClasses} leading-relaxed`}
        />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className={labelClasses}>
            Price <span className="font-normal text-ds-text-secondary">(display text)</span>
          </label>
          <input
            id="price"
            name="price"
            type="text"
            inputMode="decimal"
            placeholder="19.99"
            defaultValue={initialPrice}
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className={labelClasses}>
            Category
          </label>
          <input
            id="category"
            name="category"
            type="text"
            maxLength={60}
            placeholder="e.g. Sofas"
            defaultValue={initialCategory}
            disabled={isPending}
            className={inputClasses}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="price_amount" className={labelClasses}>
          Numeric price
        </label>
        <input
          id="price_amount"
          name="price_amount"
          type="text"
          inputMode="decimal"
          placeholder="499.00"
          defaultValue={initialPriceAmount}
          disabled={isPending}
          aria-describedby="price_amount-hint"
          className={inputClasses}
        />
        <p id="price_amount-hint" className={hintClasses}>
          Optional · Used for budget matching
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className={labelClasses}>
          Image URL
        </label>
        <input
          id="image_url"
          name="image_url"
          type="url"
          placeholder="https://example.com/product.jpg"
          defaultValue={initialImageUrl}
          onChange={(event) => {
            setPreviewUrl(event.target.value.trim());
            setPreviewFailed(false);
          }}
          disabled={isPending}
          aria-describedby="image_url-hint"
          className={inputClasses}
        />
        <p id="image_url-hint" className={hintClasses}>
          Optional · Enables photo cards in chat.
        </p>
      </div>
      <div
        aria-hidden="true"
        className="flex h-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ds-border-strong bg-ds-surface"
      >
        {canPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- previews an arbitrary URL exactly as typed, before it is saved
          <img src={previewUrl} alt="" className="size-full object-contain" onError={() => setPreviewFailed(true)} />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-ds-text-secondary">
            <ImageIcon className="size-9" strokeWidth={1.5} />
            {previewFailed ? "That image could not be loaded" : "Add an image URL to preview"}
          </span>
        )}
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {id ? null : <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />}
        {isPending ? pendingLabel : submitLabel}
      </button>
      <p className="text-center text-sm text-ds-text-secondary">Saves as a draft</p>
    </form>
  );
}
