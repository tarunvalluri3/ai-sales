import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { getProduct } from "@/lib/products";
import { ProductForm } from "../../product-form";
import { updateProductAction } from "../../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId } = await requireBusinessContext();
  const product = await getProduct(businessId, id);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <h1 className="text-2xl font-semibold text-ds-text-primary">Edit product</h1>
      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <ProductForm
          action={updateProductAction}
          id={product.id}
          initialName={product.name}
          initialDescription={product.description ?? ""}
          initialPrice={product.price ?? ""}
          initialImageUrl={product.image_url ?? ""}
          initialCategory={product.category ?? ""}
          initialPriceAmount={product.price_amount != null ? String(product.price_amount) : ""}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </section>
    </div>
  );
}
