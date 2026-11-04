"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile inside the widget iframe (production readiness item 3,
 * lib/chat-protection.ts). The iframe is our own page on our own domain, so the
 * Turnstile site key only has to allow our app's hostname -- not every
 * customer's site.
 *
 * Rendered explicitly with appearance "interaction-only": most visitors never
 * see it; a suspicious one gets a small challenge above the composer. The
 * latest token is kept in a ref; `takeToken()` hands it out for a send and
 * asks Turnstile for a fresh one (tokens are single-use, valid 5 minutes).
 * With no site key (Turnstile off) every function is a no-op.
 *
 * The script must load from Cloudflare's exact URL (their docs: proxying or
 * caching it breaks Turnstile).
 */
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.turnstile ?? null);
    // A blocked script (ad blocker, network) must never break the chat: the
    // send simply goes without a token and the server decides (log/enforce).
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile(siteKey: string | null) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const apiRef = useRef<TurnstileApi | null>(null);

  useEffect(() => {
    if (!siteKey || !container) return;
    let cancelled = false;
    void loadTurnstile().then((api) => {
      if (cancelled || !api) return;
      apiRef.current = api;
      widgetIdRef.current = api.render(container, {
        sitekey: siteKey,
        action: "widget_chat",
        appearance: "interaction-only",
        size: "flexible",
        callback: (token: string) => {
          tokenRef.current = token;
        },
        "expired-callback": () => {
          tokenRef.current = null;
        },
        "error-callback": () => {
          tokenRef.current = null;
        },
      });
    });
    return () => {
      cancelled = true;
      if (apiRef.current && widgetIdRef.current) {
        try {
          apiRef.current.remove(widgetIdRef.current);
        } catch {
          // Already gone.
        }
      }
      widgetIdRef.current = null;
      tokenRef.current = null;
    };
  }, [siteKey, container]);

  /** The current token (or null), then a fresh one is requested for the next send. */
  const takeToken = useCallback((): string | null => {
    const token = tokenRef.current;
    if (token && apiRef.current && widgetIdRef.current) {
      tokenRef.current = null;
      try {
        apiRef.current.reset(widgetIdRef.current);
      } catch {
        // Next send goes without a token; the server decides.
      }
    }
    return token;
  }, []);

  return { attachContainer: setContainer, takeToken, enabled: siteKey !== null };
}
