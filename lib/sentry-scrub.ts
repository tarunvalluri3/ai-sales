import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared beforeSend for every Sentry init (client/server/edge) -- Phase 21
 * (STATE.md / docs/phases.md)'s "PII-scrubbed" requirement. Sentry's
 * automatic request capture can otherwise include cookies and auth
 * headers; this project's chat routes also carry a widget key and,
 * inside request bodies Sentry does not capture by default, prospect
 * contact info -- this only removes what Sentry *would* auto-attach,
 * not app-level content we never send it in the first place.
 */
const SENSITIVE_HEADERS = ["authorization", "cookie", "x-widget-key"];

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          delete event.request.headers[header];
        }
      }
    }
  }
  return event;
}
