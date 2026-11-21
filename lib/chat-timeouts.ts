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

/**
 * How many times LangChain retries ONE failed Gemini chat call (production
 * readiness, LAUNCH_AUDIT.md §12). Unset, @langchain/core's AsyncCaller
 * retries 6 times with exponential backoff (~1s, 2s, 4s ... 32s, randomised),
 * which can never finish inside CHAT_MODEL_CALL_TIMEOUT_MS and multiplies load
 * on a key that is already throttled. One retry absorbs a single transient
 * 5xx (backoff ~1-2 s) while staying well inside the per-call abort, which
 * bounds both attempts together. LangChain already does not retry 4xx
 * (400/401/403/404) or a 429 without a short Retry-After.
 *
 * Bounded to 0..3 so a bad value can't reintroduce the runaway default.
 */
export const CHAT_MODEL_MAX_RETRIES_CEILING = 3;

export function boundedRetries(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, CHAT_MODEL_MAX_RETRIES_CEILING);
}

export const CHAT_MODEL_MAX_RETRIES = boundedRetries(process.env.CHAT_MODEL_MAX_RETRIES, 1);

/**
 * Widget reliability (2026-11-20, STATE.md). The streamed turn's own timing
 * contract, shortest to longest:
 *
 *   STREAM_METADATA_GRACE_MS  -- after the visible answer is complete, how long
 *     the server waits for the parallel metadata call before sending the
 *     terminal event. A slower call is not lost: it finishes in the background
 *     and its escalation is still applied (lib/chat-late-judgement.ts).
 *   STREAM_KEEPALIVE_INTERVAL_MS -- while a turn is still working (tool calls,
 *     a held-back sentence, the grace wait, persistence) the server sends a
 *     `ping` event this often, so a slow but live turn never looks dead.
 *   STREAM_CLIENT_STALL_TIMEOUT_MS -- the widget gives up on a stream that has
 *     sent NOTHING (not even a ping) for this long: only a dead connection can
 *     go this quiet. Must stay well above the keep-alive interval.
 *   STREAM_SERVER_WATCHDOG_MS -- the server ends the stream itself (error
 *     event + close) if the generation has not finished by then, measured from
 *     the start of the turn. Below the platform's hard kill.
 *   CHAT_CLIENT_TIMEOUT_MS (above) -- the widget's absolute ceiling per turn.
 *
 * perf/reply-and-save-speed (2026-11-21): the grace went 3 s -> 0.3 s. The
 * metadata call (p50 1.16 s in production) starts when the first words
 * arrive, so it usually finishes 0.6-1 s AFTER the text, and the visitor's
 * turn was held open (stop button, no Send) for that long. Now the turn ends
 * with the text; `final` says `judgementPending`, the late result is applied
 * in the background as before, and a late escalation reaches the widget
 * through its existing poll (/api/chat/poll's needsAttention +
 * attentionFlaggedAt + followUpContact), which shows the banner on that turn.
 */
export const STREAM_METADATA_GRACE_MS = 300;
export const STREAM_KEEPALIVE_INTERVAL_MS = 5_000;
export const STREAM_CLIENT_STALL_TIMEOUT_MS = 20_000;
export const STREAM_SERVER_WATCHDOG_MS = Math.min(
  CHAT_AI_DEADLINE_MS + 5_000,
  CHAT_SERVER_MAX_DURATION_SECONDS * 1_000 - 2_000,
);
