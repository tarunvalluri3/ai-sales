import "server-only";
import { auth } from "@clerk/nextjs/server";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";

/**
 * Who may download a GST document (Phase 17c): **a signed-in org:admin of
 * the business that owns it**, decided on the server, for every request.
 *
 * This is the same gate the billing page itself uses -- invoices carry the
 * business's GSTIN, address and spend, so whoever can see Billing can see
 * its invoices and nobody else can. Hiding the links is not the control; a
 * request that reaches this function from anyone else is refused whether or
 * not they were ever shown a link.
 *
 * Every refusal after "signed out" is the same bare 404, so the route never
 * says whether an invoice id exists for someone else's business, or whether
 * the caller's role was the problem.
 *
 * A signed-out visitor is sent to sign in and brought back, which is what
 * the "Download invoice" button in the invoice email needs: it is clicked
 * from a mail client, usually with no session.
 */
export async function requireBillingDownloadAccess(
  request: Request,
): Promise<{ businessId: string } | Response> {
  const { userId, orgId, orgRole, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }
  if (!orgId || !hasMinRole(orgRole, "org:admin")) {
    return new Response("Not found", { status: 404 });
  }

  const business = await getBusinessForOrg(orgId);
  if (!business) {
    return new Response("Not found", { status: 404 });
  }
  return { businessId: business.id };
}

/** A PDF response that is never cached by a shared cache or the browser's disk. */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
