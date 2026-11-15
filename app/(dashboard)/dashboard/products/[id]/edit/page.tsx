import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getProduct } from "@/lib/products";
import { ProductForm } from "../../product-form";
import { updateProductAction } from "../../actions";
import { PermissionNotice } from "../../../_components/state-views";
import { Card, PageHeader } from "../../../_components/ui";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, orgRole } = await requireBusinessContext();
  const product = await getProduct(businessId, id);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link
        href="/dashboard/products"
        className="inline-flex w-fit items-center gap-2 rounded-md text-base text-ds-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <ArrowLeft strokeWidth={1.75} className="size-4" aria-hidden="true" />
        Products
      </Link>
      <PageHeader title="Edit product" description={product.name} />
      <Card className="flex w-full max-w-xl flex-col gap-4">
        {hasMinRole(orgRole, "org:member") ? (
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
        ) : (
          <PermissionNotice />
        )}
      </Card>
    </div>
  );
}
