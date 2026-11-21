import { NextResponse } from "next/server";
import { getBusinessContextForRoute } from "@/lib/business-context";
import { loadAttentionSnapshot } from "@/lib/dashboard-poll";
import { logAndGetUserMessage } from "@/lib/errors";
import { RequestTiming } from "@/lib/request-timing";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The dashboard's attention-badge and bell poll (AttentionProvider). A GET
 * route, not a Server Action, so it never queues in front of the owner's
 * saves (lib/dashboard-poll.ts). The business comes from the Clerk session
 * only; a signed-out, org-less or suspended caller gets 401 and no data.
 */
export async function GET() {
  const timing = new RequestTiming("dashboard_attention_poll");
  try {
    const context = await getBusinessContextForRoute();
    if (!context) {
      timing.finish("rejected", { onlyIfSlowerThanMs: 1_000 });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    const snapshot = await timing.time("counts", () => loadAttentionSnapshot(context.businessId));
    timing.finish("ok", { onlyIfSlowerThanMs: 1_000 });
    return NextResponse.json(snapshot, { headers: NO_STORE });
  } catch (error) {
    timing.finish("error");
    logAndGetUserMessage(error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: NO_STORE });
  }
}
