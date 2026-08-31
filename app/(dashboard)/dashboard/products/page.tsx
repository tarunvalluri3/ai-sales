import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listProductsForBusiness, listPendingReviewProducts } from "@/lib/products";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { DeleteButton } from "../_components/delete-button";
import { ReviewActions } from "../_components/review-actions";
import { ProductForm } from "./product-form";
import { createProductAction, deleteProductAction, approveProductAction, rejectProductAction } from "./actions";
import { EmptyState } from "../_components/state-views";

export default async function ProductsPage() {
  const { businessId } = await requireBusinessContext();
  const [products, pendingProducts] = await Promise.all([
    listProductsForBusiness(businessId),
    listPendingReviewProducts(businessId),
  ]);
  const sourceDocumentIds = pendingProducts
    .map((product) => product.extracted_from_document_id)
    .filter((id): id is string => id !== null);
  const documentTitleById = await getKnowledgeDocumentTitles(businessId, sourceDocumentIds);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Products</h1>
        <p className="text-sm text-ds-text-secondary">
          What your AI sales employee can tell prospects you sell.
        </p>
      </div>

      {pendingProducts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ds-text-primary">Pending review</h2>
          <ul className="flex flex-col gap-3">
            {pendingProducts.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-4 rounded-ds-lg border border-ds-warning/40 bg-ds-warning-bg px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate font-medium text-ds-text-primary">{product.name}</p>
                  {product.description ? (
                    <p className="line-clamp-2 text-sm text-ds-text-secondary">{product.description}</p>
                  ) : null}
                  <p className="text-xs text-ds-text-muted">
                    Extracted from: {product.extracted_from_document_id
                      ? (documentTitleById.get(product.extracted_from_document_id) ?? "a deleted document")
                      : "unknown source"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {product.price ? (
                    <span className="text-sm font-semibold text-ds-accent">${product.price}</span>
                  ) : null}
                  <ReviewActions approveAction={approveProductAction} rejectAction={rejectProductAction} id={product.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first product below so your AI sales employee can answer questions about it."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li
              key={product.id}
              className="group flex items-center justify-between gap-4 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate font-medium text-ds-text-primary">{product.name}</p>
                {product.description ? (
                  <p className="line-clamp-2 text-sm text-ds-text-secondary">
                    {product.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {product.price ? (
                  <span className="text-sm font-semibold text-ds-accent">${product.price}</span>
                ) : null}
                <Link
                  href={`/dashboard/products/${product.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
                <DeleteButton action={deleteProductAction} id={product.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Add a product</h2>
        <ProductForm action={createProductAction} submitLabel="Add product" pendingLabel="Adding…" />
      </section>
    </div>
  );
}
