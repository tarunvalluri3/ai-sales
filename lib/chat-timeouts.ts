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

/**
 * The AI generation deadlines, added 2026-10-22 (STATE.md, "chat pipeline
 * latency"). They sit *inside* the server's own `maxDuration` above: the
 * platform kills the function at CHAT_SERVER_MAX_DURATION_SECONDS no matter
 * what, so these exist to end a slow turn *honestly* -- a clear timeout
 * escalation, metrics recorded as a timeout and never as a success -- well
 * before that hard kill, rather than letting the function be shot in the
 * head mid-generation and the widget show a bare error.
 *
 * Values are chosen from the production measurements in `ai_response_metrics`
 * (not intuition): a single real model call runs ~1.3-3.7 s, the slowest
 * real turn seen was ~17.7 s end to end, and the slowest synthetic turn
 * ~46 s. So the ceilings below are generous multiples of the normal case
 * yet comfortably under the 60 s function limit, leaving headroom for the
 * pre-AI setup, the post-reply writes, and serialization.
 *
 * Each is overridable by an env var for operational tuning without a
 * deploy, which is what "configurable" in the latency brief means; the
 * default is used whenever the override is absent or not a positive
 * integer, so a bad value can never make a turn hang.
 */
function positiveIntEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

/**
 * The whole AI generation (the tool-calling loop plus any fallback
 * structured call), measured from the start of the turn. On exhaustion the
 * loop stops and returns an honest timeout escalation instead of starting
 * another model call. 50 s leaves ~10 s of the 60 s function budget for the
 * setup round trips, the assistant-message write, and response serialization.
 */
export const CHAT_AI_DEADLINE_MS = positiveIntEnv("CHAT_AI_DEADLINE_MS", 50_000);

/**
 * A single Gemini call. Hard-aborted via an AbortSignal -- safe because a
 * model call has no effect on this app's database. ~8x the normal call,
 * still well under the overall deadline so one hung call cannot eat it all.
 */
export const CHAT_MODEL_CALL_TIMEOUT_MS = positiveIntEnv("CHAT_MODEL_CALL_TIMEOUT_MS", 25_000);

/**
 * A single read-only tool execution (catalog/FAQ/knowledge lookups). On
 * timeout the model is told the lookup failed and moves on; the abandoned
 * query simply finishes in the background. **Deliberately applied to
 * read-only tools only** -- `request_callback` and `book_appointment` write
 * rows and run consent gates, so cancelling one mid-flight could report a
 * failure for a write that actually happened, or leave partial state. Those
 * two always run to completion and report truthfully (AGENTS.md §3 rule 5,
 * and the brief's "never skip a tool to save time").
 */
export const CHAT_TOOL_TIMEOUT_MS = positiveIntEnv("CHAT_TOOL_TIMEOUT_MS", 15_000);
