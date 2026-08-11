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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Edit product</h1>
      <ProductForm
        action={updateProductAction}
        id={product.id}
        initialName={product.name}
        initialDescription={product.description ?? ""}
        initialPrice={product.price ?? ""}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </div>
  );
}
