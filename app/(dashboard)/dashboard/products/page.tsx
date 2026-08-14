import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listProductsForBusiness } from "@/lib/products";
import { DeleteButton } from "../_components/delete-button";
import { ProductForm } from "./product-form";
import { createProductAction, deleteProductAction } from "./actions";

export default async function ProductsPage() {
  const { businessId } = await requireBusinessContext();
  const products = await listProductsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Products</h1>
        <p className="text-sm text-ds-text-secondary">
          What your AI sales employee can tell prospects you sell.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No products yet</p>
          <p className="mt-1 text-sm text-ds-text-secondary">
            Add your first product below so your AI sales employee can answer questions about it.
          </p>
        </div>
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
