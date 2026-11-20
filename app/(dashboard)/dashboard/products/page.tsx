import { Layers } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listProductsForBusiness, listPendingReviewProducts } from "@/lib/products";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { ReviewActions } from "../_components/review-actions";
import { ProductForm } from "./product-form";
import { formatCatalogPrice } from "@/lib/currency";
import { ProductsList } from "./products-list";
import { createProductAction, deleteProductAction, approveProductAction, rejectProductAction } from "./actions";
import { PermissionNotice } from "../_components/state-views";
import { Card, PageHeader, Pill } from "../_components/ui";

export default async function ProductsPage() {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const [products, pendingProducts] = await Promise.all([
    listProductsForBusiness(businessId),
    listPendingReviewProducts(businessId),
  ]);
  const sourceDocumentIds = pendingProducts
    .map((product) => product.extracted_from_document_id)
    .filter((id): id is string => id !== null);
  const documentTitleById = await getKnowledgeDocumentTitles(businessId, sourceDocumentIds);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Layers} title="Products" description="What your AI sales employee can tell prospects you sell." />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {pendingProducts.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="dx-title">Review extracted products</h2>
                  <Pill tone="amber">{pendingProducts.length} pending</Pill>
                </div>
                <p className="dx-subtitle">Found in your uploaded knowledge. Approve the ones your AI may recommend.</p>
              </div>
              <ul className="dx-rows flex flex-col">
                {pendingProducts.map((product) => (
                  <li key={product.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- catalog photo extracted from an uploaded PDF or hand-entered URL
                      <img src={product.image_url} alt="" className="h-20 w-32 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-base font-medium text-ds-text-primary">{product.name}</p>
                      {product.description ? (
                        <p className="line-clamp-2 text-sm text-ds-text-secondary">{product.description}</p>
                      ) : null}
                      <p className="text-sm text-ds-text-muted">
                        Extracted from:{" "}
                        {product.extracted_from_document_id
                          ? (documentTitleById.get(product.extracted_from_document_id) ?? "a deleted document")
                          : "unknown source"}
                      </p>
                    </div>
                    {product.price ? (
                      <span className="text-sm font-medium text-ds-text-primary">{formatCatalogPrice(product.price, currency)}</span>
                    ) : null}
                    <ReviewActions
                      approveAction={approveProductAction}
                      rejectAction={rejectProductAction}
                      id={product.id}
                      canEdit={canEdit}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="dx-title">Your products</h2>
              <p className="dx-subtitle">
                {products.length} product{products.length === 1 ? "" : "s"}
              </p>
            </div>
            {products.length === 0 ? (
              <p className="rounded-2xl bg-ds-surface-soft px-4 py-10 text-center text-sm text-ds-text-secondary">
                No products yet. Add your first product so your AI sales employee can answer questions about it.
              </p>
            ) : (
              <ProductsList products={products} currency={currency} canEdit={canEdit} deleteProductAction={deleteProductAction} />
            )}
            <p className="border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
              Your catalog helps the AI recommend relevant products.
            </p>
          </Card>
        </div>

        <Card className="flex flex-col gap-4 xl:sticky xl:top-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Add a product</h2>
            <p className="dx-subtitle">Give your AI the details it needs.</p>
          </div>
          {canEdit ? (
            <ProductForm action={createProductAction} currency={currency} submitLabel="Add product" pendingLabel="Adding…" />
          ) : (
            <PermissionNotice />
          )}
        </Card>
      </div>
    </div>
  );
}
