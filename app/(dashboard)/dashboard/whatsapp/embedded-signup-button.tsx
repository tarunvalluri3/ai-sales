"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isMetaOrigin, parseEmbeddedSignupEvent } from "@/lib/whatsapp-embedded-signup-rules";
import { completeWhatsappEmbeddedSignupAction } from "./actions";

/**
 * WhatsApp Embedded Signup v4 (production readiness item 6). Loads Meta's JS
 * SDK, opens the signup popup with our Facebook Login for Business
 * configuration, collects the WABA + phone number ids from Meta's postMessage
 * and the one-time code from FB.login, and hands both to the server action,
 * which does every Graph call server-to-server (Meta's docs require that).
 *
 * The code lives 30 seconds, so the server action is called as soon as both
 * the code and the FINISH event have arrived (they can come in either order).
 */

type FbLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: FbLoginResponse) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FINISH_WAIT_MS = 5_000;

type Phase =
  | { kind: "idle" }
  | { kind: "loading_sdk" }
  | { kind: "in_popup" }
  | { kind: "finishing" }
  | { kind: "done"; complete: boolean; message: string | null }
  | { kind: "cancelled"; step: string | null }
  | { kind: "error"; message: string };

let sdkPromise: Promise<FacebookSdk | null> | null = null;

function loadSdk(appId: string, graphVersion: string): Promise<FacebookSdk | null> {
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      resolve(window.FB ?? null);
    };
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      resolve(null);
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

// Only the step Meta documents; any other step gets the generic wording.
const CANCEL_STEP_LABEL: Record<string, string> = {
  PHONE_NUMBER_SETUP: "while adding the phone number",
};

export function EmbeddedSignupButton({ appId, configId, graphVersion }: { appId: string; configId: string; graphVersion: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const finishRef = useRef<{ wabaId: string; phoneNumberId: string | null; businessId: string | null } | null>(null);
  const waitersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isMetaOrigin(event.origin)) return;
      const parsed = parseEmbeddedSignupEvent(event.data);
      if (!parsed) return;
      if (parsed.kind === "finish") {
        finishRef.current = { wabaId: parsed.wabaId, phoneNumberId: parsed.phoneNumberId, businessId: parsed.businessId };
        for (const wake of waitersRef.current.splice(0)) wake();
      } else if (parsed.kind === "cancel") {
        setPhase({ kind: "cancelled", step: parsed.currentStep });
      } else {
        setPhase({ kind: "error", message: `Meta reported a problem: ${parsed.message}` });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const waitForFinish = useCallback(async () => {
    if (finishRef.current) return finishRef.current;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, FINISH_WAIT_MS);
      waitersRef.current.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    return finishRef.current;
  }, []);

  const start = useCallback(async () => {
    finishRef.current = null;
    setPhase({ kind: "loading_sdk" });
    const sdk = await loadSdk(appId, graphVersion);
    if (!sdk) {
      setPhase({ kind: "error", message: "We couldn't load Facebook's sign-in. Check that nothing (like an ad blocker) blocks facebook.net, then try again." });
      return;
    }
    setPhase({ kind: "in_popup" });
    sdk.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          // Closing the popup early comes back with no code; a CANCEL event
          // (if any) has already set a more specific message.
          setPhase((current) => (current.kind === "cancelled" || current.kind === "error" ? current : { kind: "cancelled", step: null }));
          return;
        }
        void (async () => {
          setPhase({ kind: "finishing" });
          const finish = await waitForFinish();
          if (!finish || !finish.phoneNumberId) {
            setPhase({
              kind: "error",
              message: "Signup finished without a phone number. Run it again and add or choose a number for WhatsApp.",
            });
            return;
          }
          const result = await completeWhatsappEmbeddedSignupAction({
            code,
            wabaId: finish.wabaId,
            phoneNumberId: finish.phoneNumberId,
            metaBusinessId: finish.businessId,
          });
          if (!result.ok) {
            setPhase({ kind: "error", message: result.error });
            return;
          }
          setPhase({ kind: "done", complete: result.complete, message: result.message });
          router.refresh();
        })();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  }, [appId, configId, graphVersion, router, waitForFinish]);

  const busy = phase.kind === "loading_sdk" || phase.kind === "in_popup" || phase.kind === "finishing";

  return (
    <section className="flex flex-col gap-3 border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-ds-text-primary">Connect with Facebook</h2>
        <p className="text-sm text-ds-text-secondary">
          Log in with Facebook, choose or create your WhatsApp Business account, and add the phone number you want
          prospects to message. We set up the rest. Use a number that isn&rsquo;t already on the WhatsApp app.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="ds-btn-label bg-ds-primary px-4 py-2 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
        >
          {phase.kind === "loading_sdk"
            ? "Opening…"
            : phase.kind === "in_popup"
              ? "Finish in the Facebook window…"
              : phase.kind === "finishing"
                ? "Setting up your number…"
                : "Connect with Facebook"}
        </button>
      </div>
      <div aria-live="polite">
        {phase.kind === "cancelled" ? (
          <p className="text-sm text-ds-text-secondary">
            Signup was closed {phase.step ? CANCEL_STEP_LABEL[phase.step] ?? "before it finished" : "before it finished"}. Nothing was
            connected. You can start again any time.
          </p>
        ) : null}
        {phase.kind === "error" ? (
          <p role="alert" className="bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
            {phase.message}
          </p>
        ) : null}
        {phase.kind === "done" ? (
          phase.complete ? (
            <p className="bg-ds-success-bg px-3 py-2 text-sm text-ds-success">
              WhatsApp is connected. We&rsquo;ve submitted your message templates to Meta for review.
            </p>
          ) : (
            <p role="alert" className="bg-ds-warning-bg px-3 py-2 text-sm text-ds-warning">
              Almost there: {phase.message ?? "one setup step didn't finish."} Use &ldquo;Finish setup&rdquo; below.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}
