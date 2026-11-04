import "server-only";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { getInstagramConnectionForBusiness } from "@/lib/instagram";
import { logEvent } from "@/lib/logger";
import type { ConnectedMetaChannels } from "@/lib/plan-channel-copy";

/**
 * Which Meta channels a business has connected, for the "Starter would cut
 * this off" warning in the plan picker (round 3, item 3). Display-only: plan
 * access is still decided by lib/subscription.ts. Never throws -- a failed
 * read returns null, which shows the warning in its generic form rather than
 * hiding it or breaking the billing page. `businessId` must come from
 * requireBusinessContext().
 */
export async function loadConnectedMetaChannels(businessId: string): Promise<ConnectedMetaChannels> {
  try {
    const [whatsapp, instagram] = await Promise.all([
      getWhatsappConnectionForBusiness(businessId),
      getInstagramConnectionForBusiness(businessId),
    ]);
    return { whatsapp: whatsapp?.status === "connected", instagram: instagram?.status === "connected" };
  } catch {
    logEvent("connected_meta_channels_read_failed", businessId, {}, "error");
    return null;
  }
}

/** The same shape from connection rows a page has already loaded. */
export function connectedMetaChannelsFrom(
  whatsapp: { status: string } | null,
  instagram: { status: string } | null,
): ConnectedMetaChannels {
  return { whatsapp: whatsapp?.status === "connected", instagram: instagram?.status === "connected" };
}
