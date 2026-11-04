"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { INSTAGRAM_CONNECT_PATH } from "./connect-path";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "You cancelled the Instagram connection, so nothing was connected.",
  invalid_state: "That connection link wasn't valid or was already used.",
  expired_state: "That connection link expired. Connection links last 10 minutes.",
  config: "Instagram isn't set up on our side yet. Please try again later or contact support.",
  exchange_failed: "Meta didn't complete the login. Please try again.",
  long_lived_failed: "Facebook completed the login but wouldn't give us lasting access. Please try again.",
  pages_failed: "Facebook completed the login but wouldn't list your Facebook Pages. Please try again.",
  no_linked_pages:
    "Link your Instagram professional account to a Facebook Page, then try again. When Facebook asks, choose that Page.",
  permissions_missing:
    "Facebook didn't share the access we need. Try again and keep every permission ticked. If this keeps happening, your account may need access while Meta's review of our app is pending, so please contact support.",
  me_failed: "Meta completed the login but wouldn't tell us which business connected. Please try again.",
  accounts_failed: "Meta completed the login but wouldn't list the shared Instagram accounts. Please try again.",
  account_in_use: "That Instagram account is already connected to another business on AI Sales. Disconnect it there first.",
  no_accounts:
    "No Instagram account was shared. When Meta asks, choose your business portfolio and tick an Instagram professional (Business or Creator) account.",
  subscribe_failed: "Meta approved the login but refused to send this account's messages to us. Please try again.",
  subscribe_permission:
    "Facebook didn't give us permission to receive this Page's messages. This is a setup issue on our side; please contact support.",
  selection_expired: "That account choice expired. Please connect again.",
  forbidden: "Only an admin of this business can connect Instagram.",
  not_entitled: "Instagram messaging isn't available on your plan.",
  unexpected: "Something went wrong connecting Instagram. Please try again.",
};

const NO_RETRY = new Set(["forbidden", "not_entitled", "config", "subscribe_permission"]);

/**
 * Result of the Meta login round trip, from the ?connected=1 / ?error=<code>
 * the callback leaves behind. Only known codes are shown (never text from
 * the URL). Stays on screen until dismissed, with a "Try again" link.
 */
export function InstagramOAuthResult({ username }: { username: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (!connected && !error) return null;

  const dismiss = () => router.replace("/dashboard/instagram");

  if (connected) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-ds-md bg-ds-success-bg px-4 py-3 text-sm text-ds-success">
        <span>{username ? `Connected as @${username}.` : "Instagram connected."}</span>
        <DismissButton onClick={dismiss} />
      </div>
    );
  }

  const message = ERROR_MESSAGES[error ?? ""] ?? ERROR_MESSAGES.unexpected;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-ds-md bg-ds-danger-bg px-4 py-3 text-sm text-ds-danger">
      <span>
        <strong className="font-medium">Couldn&rsquo;t connect Instagram.</strong> {message}
        {error === "no_linked_pages" ? (
          <>
            {" "}
            <a href="#before-you-connect" className="font-medium underline">
              See how to link them
            </a>
          </>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        {NO_RETRY.has(error ?? "") ? null : (
          <a
            href={INSTAGRAM_CONNECT_PATH}
            className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-medium text-ds-accent-on hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Try again
          </a>
        )}
        <DismissButton onClick={dismiss} />
      </span>
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-ds-sm px-2 py-1 text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
    >
      Dismiss
    </button>
  );
}
