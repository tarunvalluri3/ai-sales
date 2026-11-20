"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ServiceForm } from "../../../dashboard/services/service-form";
import { ServicesList } from "../../../dashboard/services/services-list";
import { createServiceAction, updateServiceInPlaceAction, deleteServiceAction } from "../../../dashboard/services/actions";
import { catalogPlaceholders } from "@/lib/catalog-placeholders";
import type { Product, Service } from "@/lib/supabase/types";
import { CATALOG_DESCRIPTION_MIN_LENGTH } from "@/lib/onboarding-readiness";
import { ProductForm } from "../../../dashboard/products/product-form";
import { ProductsList } from "../../../dashboard/products/products-list";
import { createProductAction, updateProductInPlaceAction, deleteProductAction } from "../../../dashboard/products/actions";
import { advanceOnboarding } from "../../actions";
import { useOnboardingPreview } from "../preview-context";

const MIN_PRODUCTS = 1;

/** Mirrors lib/onboarding-readiness.ts's isCatalogItemComplete -- a name alone isn't enough; the server gate also requires a real (10+ char) description for business types where a catalog is required. */
function isProductComplete(product: Product | Service): boolean {
  return product.name.trim().length > 0 && (product.description ?? "").trim().length >= CATALOG_DESCRIPTION_MIN_LENGTH;
}

export function TrainProductsStep({ products, services, industry, currency }: { products: Product[]; services: Service[]; industry: string | null; currency: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<"product" | "service">("product");
  const { update } = useOnboardingPreview();

  const offerings = [...products, ...services];
  const completeCount = offerings.filter(isProductComplete).length;
  const valid = completeCount >= MIN_PRODUCTS;

  function handleBack() {
    router.push("/onboarding?step=knowledge");
  }

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      if (offerings.length > 0) update({ firstProductName: offerings[0].name });
      const result = await advanceOnboarding("faqs");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=faqs");
    });
  }

  const offering = editingId ? offerings.find((entry) => entry.id === editingId) : undefined;
  const Form = kind === "service" ? ServiceForm : ProductForm;
  const placeholders = catalogPlaceholders(industry, currency, kind);

  function editOffering(id: string, type: typeof kind) {
    setKind(type);
    setEditingId(id);
  }

  return (
    <div className="flex flex-col gap-6">
      {products.length > 0 ? (
        <ProductsList
          products={products}
          currency={currency}
          canEdit
          deleteProductAction={deleteProductAction}
          onEdit={(id) => editOffering(id, "product")}
        />
      ) : null}
      {services.length > 0 ? (
        <ServicesList services={services} currency={currency} canEdit
          deleteServiceAction={deleteServiceAction} onEdit={(id) => editOffering(id, "service")} />
      ) : null}
      {offerings.length === 0 ? (
        <p className="border border-dashed border-ds-border bg-ds-surface px-4 py-8 text-center text-sm text-ds-text-muted">
          No products or services added yet.
        </p>
      ) : null}

      <section className="flex w-full flex-col gap-4 border border-ds-border bg-ds-surface p-5">
        {offering ? (
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
            <Form
              key={offering.id}
              action={kind === "product" ? updateProductInPlaceAction : updateServiceInPlaceAction}
              onboardingPlaceholders={placeholders}
              currency={currency}
              id={offering.id}
              initialName={offering.name}
              initialDescription={offering.description ?? ""}
              initialPrice={offering.price ?? ""}
              initialImageUrl={offering.image_url ?? ""}
              initialCategory={offering.category ?? ""}
              initialPriceAmount={offering.price_amount != null ? String(offering.price_amount) : ""}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              onSuccess={() => setEditingId(null)}
            />
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium text-ds-text-primary">Add a product or service</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Offering type">
              {(["product", "service"] as const).map((type) => (
                <button type="button" key={type} aria-pressed={kind === type} onClick={() => setKind(type)}
                  className={kind === type ? "border border-ds-primary bg-ds-primary px-3 py-1.5 text-sm text-ds-primary-on" : "border border-ds-border px-3 py-1.5 text-sm text-ds-text-secondary"}>
                  {type === "product" ? "Product" : "Service"}
                </button>
              ))}
            </div>
            <Form key={kind} action={kind === "product" ? createProductAction : createServiceAction}
              onboardingPlaceholders={placeholders} currency={currency} submitLabel="Add" pendingLabel="Adding…" />
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
              {offerings.length === 0
                ? "Add at least one product or service to continue"
                : "Give it a short description (10+ characters) to continue"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !valid}
            className="ds-btn-label bg-ds-primary px-5 py-2.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
