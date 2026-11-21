"use client";

import { WizardActions, WizardContinue } from "../wizard-actions";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
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
import { Card, CardHeader, btnGhost, btnOutline } from "../../../dashboard/_components/ui";
import { useToast } from "../../../dashboard/_components/toast";

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
  const { toast } = useToast();
  const confirmAdded = useCallback(() => {
    toast({ variant: "success", title: kind === "product" ? "Product added" : "Service added" });
  }, [kind, toast]);
  const confirmEdited = useCallback(() => {
    setEditingId(null);
    toast({ variant: "success", title: "Changes saved" });
  }, [toast]);

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
      {offerings.length > 0 ? <div className="onboarding-table flex min-w-0 flex-col gap-4">
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
      </div> : null}

      <Card className="onboarding-save-form flex flex-col gap-4">
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
              onSuccess={confirmEdited}
            />
          </>
        ) : (
          <>
            <CardHeader title="Add a product or service"
              description={offerings.length === 0 ? "Start with something customers often ask you about." : undefined} />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Offering type">
              {(["product", "service"] as const).map((type) => (
                <button type="button" key={type} aria-pressed={kind === type} onClick={() => setKind(type)}
                  className={(kind === type ? btnOutline + " bg-ds-lime-soft" : btnGhost) + " min-h-11"}>
                  {type === "product" ? "Product" : "Service"}
                </button>
              ))}
            </div>
            <Form key={kind} action={kind === "product" ? createProductAction : createServiceAction}
              onboardingPlaceholders={placeholders} currency={currency} submitLabel={kind === "product" ? "Add product" : "Add service"}
              pendingLabel="Adding…" onSuccess={confirmAdded} />
          </>
        )}
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <WizardActions onBack={handleBack}>
        <WizardContinue onClick={handleContinue} pending={isPending} disabled={!valid}
          reason={valid ? undefined : offerings.length === 0
            ? "Add a product or service to continue"
            : "Add a description of at least 10 characters to continue"} />
      </WizardActions>
    </div>
  );
}
