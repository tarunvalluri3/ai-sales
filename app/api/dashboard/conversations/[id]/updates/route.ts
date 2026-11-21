import { NextResponse, type NextRequest } from "next/server";
import { getBusinessContextForRoute } from "@/lib/business-context";
import { loadConversationUpdates } from "@/lib/dashboard-poll";
import { logAndGetUserMessage } from "@/lib/errors";
import { RequestTiming } from "@/lib/request-timing";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * New messages for one open conversation (LiveConversationPanel). A GET
 * route, not a Server Action, so it never queues in front of the owner's
 * replies and take-overs (lib/dashboard-poll.ts). The business comes from
 * the Clerk session only; the conversation id and `after` cursor are
 * validated with Zod. Invalid input, a missing conversation and another
 * business's conversation all get the same empty answer the old Server
 * Action gave (no messages, cursor unchanged), so nothing is revealed and the
 * panel behaves exactly as before.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const timing = new RequestTiming("dashboard_conversation_poll");
  try {
    const business = await getBusinessContextForRoute();
    if (!business) {
      timing.finish("rejected", { onlyIfSlowerThanMs: 1_000 });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    const { id } = await context.params;
    const after = request.nextUrl.searchParams.get("after") ?? "";
    const updates = await timing.time("messages", () =>
      loadConversationUpdates(business.businessId, {
        conversationId: id,
        after,
      }),
    );
    timing.finish(updates ? "ok" : "rejected", { onlyIfSlowerThanMs: 1_000 });
    return NextResponse.json(updates ?? { messages: [], control: "ai", needsAttention: false, asOf: after }, { headers: NO_STORE });
  } catch (error) {
    timing.finish("error");
    logAndGetUserMessage(error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: NO_STORE });
  }
}
