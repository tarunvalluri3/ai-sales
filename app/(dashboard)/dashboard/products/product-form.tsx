"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ImageIcon, Plus } from "lucide-react";
import type { ProductFormState } from "./actions";
import type { CatalogFormField } from "@/lib/schemas/catalog";
import { pricePlaceholder } from "@/lib/currency";

const initialState: ProductFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60 aria-invalid:border-ds-danger";
const labelClasses = "text-sm font-medium text-ds-text-primary";
const hintClasses = "text-xs text-ds-text-secondary";
const errorClasses = "text-xs text-ds-danger";

/**
 * A rejected submit keeps everything the owner typed and shows each error
 * under its own field (2026-11-20 bug: one bad price cleared the whole form
 * and showed a single message at the bottom). React 19 resets an
 * uncontrolled form after every action, so the fields are re-mounted from the
 * values the action echoes back (`state.values`).
 */
export function ProductForm({
  action,
  id,
  currency,
  initialName = "",
  initialDescription = "",
  initialPrice = "",
  initialImageUrl = "",
  initialCategory = "",
  initialPriceAmount = "",
  onboardingPlaceholders,
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  action: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  id?: string;
  /** The business's currency (ISO 4217), for the price placeholder. */
  currency: string;
  initialName?: string;
  initialDescription?: string;
  initialPrice?: string;
  initialImageUrl?: string;
  initialCategory?: string;
  initialPriceAmount?: string;
  onboardingPlaceholders?: { name: string; price: string };
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
  // Bumped on every rejected submit so the fields re-mount with the echoed values.
  const [fieldsVersion, setFieldsVersion] = useState(0);

  // Adjusted during render (keyed on the action result) rather than in an effect.
  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success && !id) {
      setPreviewUrl("");
      setPreviewFailed(false);
    }
    if (state.values) {
      setFieldsVersion((version) => version + 1);
      setPreviewUrl(state.values.image_url.trim());
    }
  }

  useEffect(() => {
    if (state.success) {
      if (!id) formRef.current?.reset();
      onSuccess?.();
    }
  }, [state.success, id, onSuccess]);

  const canPreview = /^https?:\/\//.test(previewUrl) && !previewFailed;
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const fieldError = (field: CatalogFormField) =>
    errors[field] ? (
      <p id={`${field}-error`} role="alert" className={errorClasses}>
        {errors[field]}
      </p>
    ) : null;
  const describedBy = (field: CatalogFormField, hintId?: string) =>
    [errors[field] ? `${field}-error` : null, hintId ?? null].filter(Boolean).join(" ") || undefined;

  const budgetField = (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_amount" className={labelClasses}>
            Budget-matching price <span className="font-normal text-ds-text-secondary">(number, optional)</span>
          </label>
          <input
            id="price_amount"
            name="price_amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 6500"
            defaultValue={values?.price_amount ?? initialPriceAmount}
            disabled={isPending}
            aria-invalid={errors.price_amount ? true : undefined}
            aria-describedby={describedBy("price_amount", "price_amount-hint")}
            className={inputClasses}
          />
          <p id="price_amount-hint" className={hintClasses}>
            Lets the AI match a prospect&rsquo;s budget. Left blank, it&rsquo;s taken from the price when that&rsquo;s a single number.
          </p>
          {fieldError("price_amount")}
        </div>
  );

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3.5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div key={fieldsVersion} className="flex w-full flex-col gap-3.5">
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
            placeholder={onboardingPlaceholders?.name ?? "e.g. Website Starter Kit"}
            defaultValue={values?.name ?? initialName}
            disabled={isPending}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
            className={inputClasses}
          />
          {fieldError("name")}
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
            defaultValue={values?.description ?? initialDescription}
            disabled={isPending}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy("description")}
            className={`${inputClasses} leading-relaxed`}
          />
          {fieldError("description")}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="price" className={labelClasses}>
              Price
            </label>
            <input
              id="price"
              name="price"
              type="text"
              maxLength={60}
              placeholder={onboardingPlaceholders?.price ?? pricePlaceholder(currency)}
              defaultValue={values?.price ?? initialPrice}
              disabled={isPending}
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={describedBy("price", "price-hint")}
              className={inputClasses}
            />
            <p id="price-hint" className={hintClasses}>
              Shown to prospects as you write it. A plain number shows in {currency}.
            </p>
            {fieldError("price")}
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
              defaultValue={values?.category ?? initialCategory}
              disabled={isPending}
              aria-invalid={errors.category ? true : undefined}
              aria-describedby={describedBy("category")}
              className={inputClasses}
            />
            {fieldError("category")}
          </div>
        </div>
        {onboardingPlaceholders ? (
          <details open={errors.price_amount ? true : undefined}>
            <summary className="cursor-pointer text-sm font-medium text-ds-text-primary">Advanced</summary>
            <div className="pt-2">{budgetField}</div>
          </details>
        ) : budgetField}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="image_url" className={labelClasses}>
            Image URL
          </label>
          <input
            id="image_url"
            name="image_url"
            type="url"
            placeholder="https://example.com/product.jpg"
            defaultValue={values?.image_url ?? initialImageUrl}
            onChange={(event) => {
              setPreviewUrl(event.target.value.trim());
              setPreviewFailed(false);
            }}
            disabled={isPending}
            aria-invalid={errors.image_url ? true : undefined}
            aria-describedby={describedBy("image_url", "image_url-hint")}
            className={inputClasses}
          />
          <p id="image_url-hint" className={hintClasses}>
            Optional · Enables photo cards in chat.
          </p>
          {fieldError("image_url")}
        </div>
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
