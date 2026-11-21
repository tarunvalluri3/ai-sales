/**
 * How often a dashboard poll runs (perf/reply-and-save-speed, STATE.md
 * 2026-11-21): every second while something changed recently, every five
 * seconds once nothing has changed for half a minute. A change, or the
 * owner's own action (which polls immediately), brings it straight back to
 * one second. Hidden tabs do not poll at all (each poller pauses on
 * `visibilitychange` and polls once on return).
 *
 * Pure, so scripts/run-perf-speed-tests.mjs checks it with plain numbers.
 */
export const POLL_FAST_MS = 1_000;
export const POLL_SLOW_MS = 5_000;
export const POLL_QUIET_AFTER_MS = 30_000;

/** Delay before the next poll, given when the polled data last changed. */
export function nextPollDelayMs(lastChangeAtMs: number, nowMs: number): number {
  return nowMs - lastChangeAtMs < POLL_QUIET_AFTER_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}
