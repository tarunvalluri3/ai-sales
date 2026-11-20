/**
 * The widget's client-side deadlines for ONE chat turn (widget reliability
 * item 1, STATE.md 2026-11-20). Pure and timer-injectable, so
 * scripts/run-widget-reliability-tests.mjs drives it with a fake clock; the
 * React hook (use-widget-chat.ts) owns one per in-flight request.
 *
 * Two clocks:
 *  - absolute (CHAT_CLIENT_TIMEOUT_MS): armed at send, never cleared by a
 *    token. Before this fix the first token cleared the widget's only timer,
 *    so a stream that stalled after its text left the stop button stuck.
 *  - stall (STREAM_CLIENT_STALL_TIMEOUT_MS): armed by the first stream event
 *    and re-armed by EVERY later one, including the server's keep-alive
 *    `ping`. A live-but-slow turn (tool calls, a held sentence, ~15 s booking
 *    turns) keeps pinging, so only a dead connection can trip it. Not armed
 *    before the first event, because the pre-stream work (auth, rate limits,
 *    writes, cold start) has no pings -- the absolute clock covers it.
 *
 * Fires `onTimeout` at most once; `stop()` disarms both.
 */

export type TurnTimeoutReason = "absolute" | "stall";

export type TurnWatchOptions = {
  absoluteMs: number;
  stallMs: number;
  onTimeout: (reason: TurnTimeoutReason) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class WidgetTurnWatch {
  private absoluteHandle: unknown = null;
  private stallHandle: unknown = null;
  private done = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly options: TurnWatchOptions;

  constructor(options: TurnWatchOptions) {
    this.options = options;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** Call once, when the message is sent. */
  start(): void {
    if (this.done) return;
    this.absoluteHandle = this.setTimer(() => this.fire("absolute"), this.options.absoluteMs);
  }

  /** Call on every stream event (start, delta, retract, ping). */
  activity(): void {
    if (this.done) return;
    if (this.stallHandle !== null) this.clearTimer(this.stallHandle);
    this.stallHandle = this.setTimer(() => this.fire("stall"), this.options.stallMs);
  }

  /** The turn ended (terminal event, abort, error, or a new chat). */
  stop(): void {
    this.done = true;
    if (this.absoluteHandle !== null) this.clearTimer(this.absoluteHandle);
    if (this.stallHandle !== null) this.clearTimer(this.stallHandle);
    this.absoluteHandle = null;
    this.stallHandle = null;
  }

  private fire(reason: TurnTimeoutReason): void {
    if (this.done) return;
    this.stop();
    this.options.onTimeout(reason);
  }
}
