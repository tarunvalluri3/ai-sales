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
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Products</h1>

      <ul className="flex flex-col gap-3">
        {products.length === 0 ? (
          <li className="text-sm text-zinc-600">No products yet.</li>
        ) : null}
        {products.map((product) => (
          <li
            key={product.id}
            className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-zinc-900">{product.name}</p>
              {product.description ? (
                <p className="text-sm text-zinc-600">{product.description}</p>
              ) : null}
              {product.price ? (
                <p className="text-sm text-zinc-600">${product.price}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/products/${product.id}/edit`}
                className="text-sm font-medium text-zinc-900 underline"
              >
                Edit
              </Link>
              <DeleteButton action={deleteProductAction} id={product.id} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Add a product</h2>
        <ProductForm
          action={createProductAction}
          submitLabel="Add product"
          pendingLabel="Adding…"
        />
      </div>
    </div>
  );
}
