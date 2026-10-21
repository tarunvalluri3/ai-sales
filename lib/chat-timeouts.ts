/**
 * The one source of truth for how long a chat turn is allowed to take, and
 * for the ordering between the server's own deadline and the widget's.
 *
 * NOT "server-only": the widget hook that runs in the browser
 * (app/(widget)/widget/embed/_lib/use-widget-chat.ts) imports from here,
 * which is the whole point -- the two deadlines used to be two unrelated
 * literals in two files, 30s on the client and 60s on the server, and the
 * client's fired first. Measured 2026-10-21: 5 of 220 production turns
 * finished server-side and still showed the prospect an error, because the
 * widget had already given up on them.
 *
 * The ordering that must hold, from shortest to longest:
 *
 *   1. CHAT_SERVER_MAX_DURATION_SECONDS -- the serverless function's own
 *      limit. The platform kills the function here, so no turn can ever
 *      legitimately take longer than this.
 *   2. CHAT_CLIENT_TIMEOUT_MS -- when the widget gives up and shows the
 *      prospect an error. Strictly greater than (1) plus a margin, so the
 *      client can only ever fire *after* the server has already failed,
 *      never while a turn is still running. The margin covers everything
 *      outside the function's own clock: cold start, DNS/TLS, request and
 *      response travel, and the browser's own scheduling of the timer.
 *
 * A prospect must never see an error for a turn the server completed. That
 * is a one-way requirement: raising the server's limit without raising the
 * client's would reintroduce the exact bug this file exists to prevent, so
 * CHAT_CLIENT_TIMEOUT_MS is *derived* from the server's value rather than
 * written out independently.
 *
 * `app/api/chat/route.ts` cannot `export const maxDuration =
 * CHAT_SERVER_MAX_DURATION_SECONDS` -- Next.js reads that export
 * statically out of the built route, so it has to be a literal there
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md).
 * That route instead keeps the literal next to a compile-time assertion
 * that it still equals this constant, so the two cannot drift silently.
 */
export const CHAT_SERVER_MAX_DURATION_SECONDS = 60;

/**
 * How much longer than the server's own deadline the widget waits before
 * giving up. Generous on purpose: being a few seconds late to show an
 * error costs a prospect nothing, while being early destroys a real answer
 * the business already paid Gemini for.
 */
export const CHAT_CLIENT_TIMEOUT_MARGIN_MS = 15_000;

/** Derived, never written independently -- see this file's header. */
export const CHAT_CLIENT_TIMEOUT_MS =
  CHAT_SERVER_MAX_DURATION_SECONDS * 1_000 + CHAT_CLIENT_TIMEOUT_MARGIN_MS;
