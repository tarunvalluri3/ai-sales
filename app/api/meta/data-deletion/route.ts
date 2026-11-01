import { after, NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { readSignedRequestField, verifyMetaSignedRequest } from "@/lib/meta-signed-request";
import { createDeletionRequest, runInstagramDataDeletion } from "@/lib/instagram-data-deletion";
import { DATA_DELETION_STATUS_URL } from "@/lib/site-contact";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Meta's "Data Deletion Request Callback URL". Verifies `signed_request`
 * (HMAC-SHA256, INSTAGRAM_APP_SECRET), records a request, answers at once
 * with the `{ url, confirmation_code }` JSON Meta requires, and runs the
 * deletion in after() so Meta is never kept waiting. The person can follow
 * progress at /data-deletion/status?code=<code>. Never logs the body, a
 * token or message content.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const verified = verifyMetaSignedRequest(
    await readSignedRequestField(request),
    process.env.INSTAGRAM_APP_SECRET,
  );
  if (!verified.ok) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  let confirmationCode: string;
  try {
    confirmationCode = await createDeletionRequest(supabase, verified.userId);
  } catch (error) {
    logAndGetUserMessage(error);
    return new Response(null, { status: 500 });
  }

  after(() => runInstagramDataDeletion(supabase, confirmationCode, verified.userId));

  return NextResponse.json({
    url: `${DATA_DELETION_STATUS_URL}?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
