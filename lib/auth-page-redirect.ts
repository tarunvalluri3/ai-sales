import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAgentPublished } from "@/lib/agent-published";
import { getBusinessForOrg } from "@/lib/business";

export async function redirectSignedInFromAuthPage() {
  const { userId, orgId } = await auth();
  if (!userId) return;
  const business = orgId ? await getBusinessForOrg(orgId) : null;
  redirect(business && isAgentPublished(business) ? "/dashboard" : "/onboarding");
}
