"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "../_components/toast";

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  denied: "You declined the Instagram connection request.",
  invalid: "That connection link was invalid. Please try again.",
  forbidden: "You don't have permission to do this.",
  config: "Instagram isn't configured yet. Please try again later.",
  unexpected: "Something went wrong connecting Instagram. Please try again.",
};

/**
 * Fires a toast for the ?connected=1 / ?error=... query params
 * app/api/oauth/instagram/callback/route.ts's redirect leaves behind,
 * then strips them from the URL so a refresh doesn't re-fire it. The
 * connection-status card below already reflects the real state on the
 * next server render (via router.refresh()) -- this is purely the
 * one-time toast, not the source of truth.
 */
export function InstagramOAuthResult() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  useEffect(() => {
    if (connected) {
      toast({ title: "Instagram connected", variant: "success" });
      router.replace("/dashboard/instagram");
      router.refresh();
    } else if (error) {
      toast({ title: "Couldn't connect Instagram", description: KNOWN_ERROR_MESSAGES[error] ?? error, variant: "error" });
      router.replace("/dashboard/instagram");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once for the query params present on the redirect that landed here, not on every router/toast identity change.
  }, [connected, error]);

  return null;
}
