/**
 * Permanent, identifier-free timing logs for the requests owners and
 * prospects wait on (perf/reply-and-save-speed, STATE.md 2026-11-21).
 *
 * Why it exists: Vercel Hobby keeps runtime logs for 30 minutes and the
 * onboarding/catalog actions persisted no timings at all, so a slow click
 * reported a day later could not be explained. `ai_response_metrics` only
 * covers AI turns, and its clock starts on the handler's first line -- a
 * cold start (new instance, code loading) happens before that and was
 * invisible. Every line this module writes says whether the request was the
 * first one on a fresh server instance and how old the instance was.
 *
 * Where it goes: ONE JSON line on stdout (console.log). Vercel's runtime log
 * and a self-hosted `next start` under PM2 (its *-out.log, see
 * docs/launch-runbook.md section 9) both capture it as is, so the line
 * carries its own `at` timestamp rather than relying on a log prefix. On a
 * long-running VPS process `cold` is true only for the first request after
 * a (re)start of that process, and false from then on.
 *
 * Privacy contract (owner's rule): the log carries ONLY the fixed fields
 * below. `name` and stage names must match NAME_PATTERN (lowercase words and
 * digits -- code literals, never data); anything else is replaced with
 * "invalid". No business/user/conversation id, name, email, phone number or
 * message text can reach this log. scripts/run-perf-speed-tests.mjs enforces
 * the field list.
 *
 * Pure: no Next.js or Supabase import, so tests drive it with a fake clock.
 */

export type RequestTimingOutcome = "ok" | "redirect" | "rejected" | "error";

export type RequestTimingStage = { stage: string; ms: number };

export type RequestTimingLog = {
  event: "request_timing";
  /** When the request started (ISO 8601, UTC). */
  at: string;
  name: string;
  outcome: RequestTimingOutcome;
  totalMs: number;
  /** True for the first request this server instance handled (a cold start). */
  cold: boolean;
  /** Milliseconds since this server instance started (instrumentation.ts), at the start of the request. */
  instanceAgeMs: number;
  /** Node's process uptime at the start of the request: on a cold request, roughly boot + code loading. */
  processUptimeMs: number;
  stages: RequestTimingStage[];
};

const NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const INSTANCE_KEY = Symbol.for("ai-sales.request-timing.instance");

type InstanceState = { startedAt: number; requests: number };

/**
 * Instance-wide state on globalThis: Next.js may evaluate this module once
 * per route bundle, but there is one Node process per instance, and "cold"
 * must mean "first request on this instance", not "first request on this
 * route's copy of the module".
 */
function instanceState(now: number): InstanceState {
  const holder = globalThis as typeof globalThis & { [INSTANCE_KEY]?: InstanceState };
  if (!holder[INSTANCE_KEY]) holder[INSTANCE_KEY] = { startedAt: now, requests: 0 };
  return holder[INSTANCE_KEY];
}

/** Called once from instrumentation.ts register(), so instance age counts from server start. */
export function markInstanceStart(now: number = Date.now()): void {
  instanceState(now);
}

function safeName(value: string): string {
  return NAME_PATTERN.test(value) ? value : "invalid";
}

function processUptimeMs(): number {
  try {
    return Math.round(process.uptime() * 1000);
  } catch {
    return -1;
  }
}

export type RequestTimingOptions = {
  /** Injectable clock (tests). */
  now?: () => number;
  /** Where the finished line goes (tests). Defaults to console.log. */
  write?: (line: string) => void;
};

export class RequestTiming {
  private readonly name: string;
  private readonly now: () => number;
  private readonly write: (line: string) => void;
  private readonly startedAt: number;
  private readonly cold: boolean;
  private readonly instanceAgeMs: number;
  private readonly uptimeMs: number;
  private readonly stages: RequestTimingStage[] = [];
  private readonly marked = new Set<string>();
  private finished = false;

  constructor(name: string, options: RequestTimingOptions = {}) {
    this.name = safeName(name);
    this.now = options.now ?? Date.now;
    this.write = options.write ?? ((line) => console.log(line));
    this.startedAt = this.now();
    const instance = instanceState(this.startedAt);
    this.cold = instance.requests === 0;
    instance.requests += 1;
    this.instanceAgeMs = Math.max(0, this.startedAt - instance.startedAt);
    this.uptimeMs = processUptimeMs();
  }

  /** Milliseconds since the request started. */
  elapsedMs(): number {
    return Math.max(0, this.now() - this.startedAt);
  }

  /** Runs `work` and records its duration under `stage`, on success and failure alike. */
  async time<T>(stage: string, work: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await work();
    } finally {
      this.stages.push({ stage: safeName(stage), ms: Math.max(0, this.now() - started) });
    }
  }

  /** Records the time since the request started as `at_<stage>`, once per stage name. */
  mark(stage: string): void {
    const name = safeName(`at_${stage}`);
    if (this.marked.has(name)) return;
    this.marked.add(name);
    this.stages.push({ stage: name, ms: this.elapsedMs() });
  }

  /**
   * Writes the one log line for this request (later calls are no-ops).
   * `onlyIfSlowerThanMs` keeps a hot path (a poll) quiet: it then logs only
   * a cold or slow request. Returns what was written, or null.
   */
  finish(outcome: RequestTimingOutcome, options: { onlyIfSlowerThanMs?: number } = {}): RequestTimingLog | null {
    if (this.finished) return null;
    this.finished = true;
    const totalMs = this.elapsedMs();
    if (options.onlyIfSlowerThanMs !== undefined && !this.cold && totalMs < options.onlyIfSlowerThanMs) return null;
    const log: RequestTimingLog = {
      event: "request_timing",
      at: new Date(this.startedAt).toISOString(),
      name: this.name,
      outcome,
      totalMs,
      cold: this.cold,
      instanceAgeMs: this.instanceAgeMs,
      processUptimeMs: this.uptimeMs,
      stages: this.stages.map((stage) => ({ stage: stage.stage, ms: stage.ms })),
    };
    try {
      this.write(JSON.stringify(log));
    } catch {
      // Logging must never break the request.
    }
    return log;
  }
}

/**
 * Next.js signals redirect()/notFound() by throwing; those are not failures.
 * Duck-typed on the documented `digest` prefix so this module stays free of
 * Next.js imports.
 */
export function timingOutcomeForError(error: unknown): RequestTimingOutcome {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  if (digest.startsWith("NEXT_REDIRECT")) return "redirect";
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") return "rejected";
  return "error";
}

/**
 * Signals Next.js throws while it decides HOW to render (e.g. `next build`
 * probing a page that reads headers/auth for static rendering). They are not
 * requests anyone waited on, so they are rethrown without a log line. Same
 * set unstable_rethrow() checks, duck-typed to keep this module Next-free.
 */
const RENDERING_SIGNAL_DIGESTS = new Set([
  "DYNAMIC_SERVER_USAGE",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
  "HANGING_PROMISE_REJECTION",
  "NEXT_PRERENDER_INTERRUPTED",
]);

export function isRenderingSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { $$typeof?: unknown }).$$typeof === Symbol.for("react.postpone")) return true;
  const digest = "digest" in error ? String((error as { digest: unknown }).digest) : "";
  return RENDERING_SIGNAL_DIGESTS.has(digest);
}

/**
 * Wraps a whole server action or page render: logs one line whether it
 * returns, redirects or throws, and rethrows exactly what it got.
 */
export async function withRequestTiming<T>(
  name: string,
  run: (timing: RequestTiming) => Promise<T>,
  outcomeOf: (result: T) => RequestTimingOutcome = () => "ok",
  options?: RequestTimingOptions,
): Promise<T> {
  const timing = new RequestTiming(name, options);
  try {
    const result = await run(timing);
    timing.finish(outcomeOf(result));
    return result;
  } catch (error) {
    if (!isRenderingSignal(error)) timing.finish(timingOutcomeForError(error));
    throw error;
  }
}
