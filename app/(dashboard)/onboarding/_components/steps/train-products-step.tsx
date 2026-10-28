"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Product } from "@/lib/supabase/types";
import { CATALOG_DESCRIPTION_MIN_LENGTH } from "@/lib/onboarding-readiness";
import { ProductForm } from "../../../dashboard/products/product-form";
import { ProductsList } from "../../../dashboard/products/products-list";
import { createProductAction, updateProductInPlaceAction, deleteProductAction } from "../../../dashboard/products/actions";
import { advanceOnboarding } from "../../actions";
import { useOnboardingPreview } from "../preview-context";

const MIN_PRODUCTS = 1;

/** Mirrors lib/onboarding-readiness.ts's isCatalogItemComplete -- a name alone isn't enough; the server gate also requires a real (10+ char) description for business types where a catalog is required. */
function isProductComplete(product: Product): boolean {
  return product.name.trim().length > 0 && (product.description ?? "").trim().length >= CATALOG_DESCRIPTION_MIN_LENGTH;
}

export function TrainProductsStep({ products }: { products: Product[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { update } = useOnboardingPreview();

  const completeCount = products.filter(isProductComplete).length;
  const valid = completeCount >= MIN_PRODUCTS;

  function handleBack() {
    router.push("/onboarding?step=knowledge");
  }

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      if (products.length > 0) update({ firstProductName: products[0].name });
      const result = await advanceOnboarding("faqs");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=faqs");
    });
  }

  const editingProduct = editingId ? (products.find((p) => p.id === editingId) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      {products.length > 0 ? (
        <ProductsList
          products={products}
          canEdit
          deleteProductAction={deleteProductAction}
          onEdit={(id) => setEditingId(id)}
        />
      ) : (
        <p className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-4 py-8 text-center text-sm text-ds-text-muted">
          No products or services added yet.
        </p>
      )}

      <section className="flex w-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        {editingProduct ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ds-text-primary">Edit product or service</h2>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-xs font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
              >
                Cancel
              </button>
            </div>
            <ProductForm
              key={editingProduct.id}
              action={updateProductInPlaceAction}
              id={editingProduct.id}
              initialName={editingProduct.name}
              initialDescription={editingProduct.description ?? ""}
              initialPrice={editingProduct.price ?? ""}
              initialImageUrl={editingProduct.image_url ?? ""}
              initialCategory={editingProduct.category ?? ""}
              initialPriceAmount={editingProduct.price_amount != null ? String(editingProduct.price_amount) : ""}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              onSuccess={() => setEditingId(null)}
            />
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium text-ds-text-primary">Add a product or service</h2>
            <ProductForm action={createProductAction} submitLabel="Add" pendingLabel="Adding…" />
          </>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {!valid ? (
            <span className="text-xs text-ds-text-muted">
              {products.length === 0
                ? "Add at least one product or service to continue"
                : "Give it a short description (10+ characters) to continue"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !valid}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
