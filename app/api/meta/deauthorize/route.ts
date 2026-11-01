import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { readSignedRequestField, verifyMetaSignedRequest } from "@/lib/meta-signed-request";
import { deauthorizeInstagramUser } from "@/lib/instagram-data-deletion";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Meta's "Deauthorize Callback URL": called when an account owner removes
 * the app in Instagram. Authenticity comes only from the HMAC on
 * `signed_request` (INSTAGRAM_APP_SECRET); the business is resolved
 * server-side from the verified Instagram id, never from the request. Never
 * logs the body, the token or any message content.
 */
export async function POST(request: NextRequest) {
  const verified = verifyMetaSignedRequest(
    await readSignedRequestField(request),
    process.env.INSTAGRAM_APP_SECRET,
  );
  if (!verified.ok) {
    return new Response(null, { status: 401 });
  }

  try {
    await deauthorizeInstagramUser(createServiceSupabaseClient(), verified.userId);
  } catch (error) {
    logAndGetUserMessage(error);
    // A 500 makes Meta retry, which is what we want for a transient failure.
    return new Response(null, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
