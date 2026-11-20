/**
 * Builds the Server-Sent-Events body for one streamed widget chat turn
 * (widget reliability item 1, STATE.md 2026-11-20).
 *
 * Live bug this exists to prevent: the widget froze on "stop" for 45+ s after
 * a reply had fully streamed. The server waited for the parallel metadata call,
 * the metrics/cache writes and the assistant-message write before it sent the
 * terminal event, an interrupted/timed-out turn sent no terminal event at all,
 * and the stream only closed after notifications/workflows had run.
 *
 * Contract, on EVERY path (success, tool error, guard rewrite, server timeout,
 * persistence failure, a generator that hangs, the client going away):
 *   1. `meta` first;
 *   2. `delta` / `retract` as the generator yields them, `ping` every
 *      `keepAliveMs` while nothing else has been sent;
 *   3. exactly ONE terminal event (`final` or `error`);
 *   4. side effects run only AFTER the terminal event (the visitor never waits
 *      on them), then the stream closes -- in a finally, so it always closes.
 *
 * Pure: no Next/Supabase import, everything is injected, so
 * scripts/run-widget-reliability-tests.mjs drives it with fake generators.
 */
import { encodeStreamEvent, type ChatStreamEvent, type StreamRecommendedProduct } from "@/lib/chat-stream";

export type SseTurnResponse = {
  escalate: boolean;
  recommendedProducts: StreamRecommendedProduct[];
};

export type SseTurnChunk<R extends SseTurnResponse> =
  | { kind: "delta"; text: string }
  | { kind: "retract"; text: string }
  | { kind: "final"; response: R; interrupted: boolean };

export type SseTurnOptions<R extends SseTurnResponse> = {
  meta: { conversationId: string; asOf: string | null };
  /** Starts the generation. `signal` aborts when the client leaves or the watchdog fires. */
  generate: (signal: AbortSignal) => AsyncIterable<SseTurnChunk<R>>;
  /** Writes the assistant message; returns the poll cursor for the terminal event. */
  persist: (response: R, interrupted: boolean) => Promise<{ asOf: string }>;
  /** Extra fields for the `final` event (e.g. the masked follow-up contact). Failure is ignored. */
  finalExtras?: (response: R) => Promise<{ followUpContact?: string | null }>;
  /** Everything that happens after the answer (escalation, metrics, ...). Runs after the terminal event. */
  sideEffects: (response: R, interrupted: boolean) => Promise<void>;
  /** Server-side logging of an unexpected error (never sent to the client). */
  logError: (stage: "generate" | "persist" | "side_effects" | "watchdog", error: unknown) => void;
  /** The request's own abort signal (client disconnected). */
  clientSignal?: AbortSignal;
  keepAliveMs: number;
  /** The server ends the turn itself after this long (error + close). */
  watchdogMs: number;
};

const WATCHDOG = Symbol("watchdog");

export function createChatSseStream<R extends SseTurnResponse>(options: SseTurnOptions<R>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const generationAbort = new AbortController();
  const onClientAbort = () => generationAbort.abort();
  options.clientSignal?.addEventListener("abort", onClientAbort);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      let terminalSent = false;
      let lastSentAt = Date.now();
      const emit = (event: ChatStreamEvent) => {
        if (!open) return;
        if (event.type === "final" || event.type === "error") {
          if (terminalSent) return; // exactly one terminal event, ever
          terminalSent = true;
        }
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
          lastSentAt = Date.now();
        } catch {
          // The connection is gone; persistence and side effects still run.
          open = false;
        }
      };

      const keepAlive = setInterval(() => {
        if (!terminalSent && Date.now() - lastSentAt >= options.keepAliveMs - 50) emit({ type: "ping" });
      }, Math.max(50, Math.floor(options.keepAliveMs / 2)));

      let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
      const watchdog = new Promise<typeof WATCHDOG>((resolve) => {
        watchdogTimer = setTimeout(() => resolve(WATCHDOG), options.watchdogMs);
      });

      let finalChunk: { response: R; interrupted: boolean } | null = null;
      let persisted = false;
      try {
        emit({ type: "meta", conversationId: options.meta.conversationId, asOf: options.meta.asOf });

        // --- generation, raced against the watchdog on every step ----------
        let generationFailed = false;
        let watchdogFired = false;
        const iterator = options.generate(generationAbort.signal)[Symbol.asyncIterator]();
        try {
          for (;;) {
            const step = await Promise.race([iterator.next(), watchdog]);
            if (step === WATCHDOG) {
              watchdogFired = true;
              break;
            }
            if (step.done) break;
            const chunk = step.value;
            if (chunk.kind === "delta") emit({ type: "delta", text: chunk.text });
            else if (chunk.kind === "retract") emit({ type: "retract", text: chunk.text });
            else finalChunk = { response: chunk.response, interrupted: chunk.interrupted };
          }
        } catch (error) {
          generationFailed = true;
          options.logError("generate", error);
        }

        if (watchdogFired) {
          options.logError("watchdog", new Error(`stream watchdog fired after ${options.watchdogMs}ms`));
          generationAbort.abort();
          // Unwind the generator in the background; its result is discarded.
          void Promise.resolve(iterator.return?.(undefined)).catch(() => undefined);
          emit({ type: "error", kind: "failure" });
          return;
        }
        if (generationFailed || !finalChunk) {
          emit({ type: "error", kind: "failure" });
          return;
        }

        // --- persistence, then the ONE terminal event -----------------------
        const { response, interrupted } = finalChunk;
        let asOf: string;
        try {
          ({ asOf } = await options.persist(response, interrupted));
          persisted = true;
        } catch (error) {
          options.logError("persist", error);
          emit({ type: "error", kind: "failure" });
          return;
        }
        let extras: { followUpContact?: string | null } = {};
        if (options.finalExtras) {
          try {
            extras = await options.finalExtras(response);
          } catch {
            extras = {};
          }
        }
        // An interrupted turn (server timeout with partial text) still ends
        // with `final`: the partial answer stays and the visitor can type.
        emit({
          type: "final",
          escalate: response.escalate,
          recommendedProducts: response.recommendedProducts,
          asOf,
          followUpContact: extras.followUpContact ?? null,
        });
      } catch (error) {
        options.logError("generate", error);
        emit({ type: "error", kind: "failure" });
      } finally {
        clearInterval(keepAlive);
        if (watchdogTimer) clearTimeout(watchdogTimer);
        // Belt and braces: whatever happened above, the client gets a terminal event.
        if (!terminalSent) emit({ type: "error", kind: "failure" });
        if (finalChunk && persisted) {
          try {
            await options.sideEffects(finalChunk.response, finalChunk.interrupted);
          } catch (error) {
            options.logError("side_effects", error);
          }
        }
        options.clientSignal?.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // Already closed/cancelled.
        }
      }
    },
    cancel() {
      options.clientSignal?.removeEventListener("abort", onClientAbort);
      generationAbort.abort();
    },
  });
}
