import { NextResponse } from "next/server";
import { getBusinessContextForRoute } from "@/lib/business-context";
import { loadConversationList } from "@/lib/dashboard-poll";
import { logAndGetUserMessage } from "@/lib/errors";
import { RequestTiming } from "@/lib/request-timing";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The conversations inbox list (ChatListPane). A GET route, not a Server
 * Action, so it never queues in front of the owner's replies and take-overs
 * (lib/dashboard-poll.ts). Same access as the former pollConversationsAction:
 * any member of the business, resolved from the Clerk session only; a
 * signed-out, org-less or suspended caller gets 401 and no data.
 */
export async function GET() {
  const timing = new RequestTiming("dashboard_conversation_list_poll");
  try {
    const context = await getBusinessContextForRoute();
    if (!context) {
      timing.finish("rejected", { onlyIfSlowerThanMs: 1_000 });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    const list = await timing.time("list", () => loadConversationList(context.businessId));
    timing.finish("ok", { onlyIfSlowerThanMs: 1_000 });
    return NextResponse.json(list, { headers: NO_STORE });
  } catch (error) {
    timing.finish("error");
    logAndGetUserMessage(error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: NO_STORE });
  }
}
