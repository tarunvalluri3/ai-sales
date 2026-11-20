// Runs the REAL public/widget-loader.js (plain browser JS, no build step) inside
// a Node `vm` context with a minimal fake DOM, a scripted fetch and a manual
// clock, so its network/postMessage behaviour can be unit-tested without a
// browser (widget reliability, STATE.md 2026-11-20). No dependency.
//
//   const h = createLoaderHarness({ fetchHandler });
//   h.iframeLoad();                       // the iframe's "load" event
//   h.fromIframe({ type: "widget:ready" });
//   await h.flush();                      // let promises settle
//   h.advance(3000);                      // fire due timers
//   h.posted                              // everything posted to the iframe
//   h.requests                            // every fetch made: { url, body }
import { readFileSync } from "node:fs";
import vm from "node:vm";

const LOADER_SOURCE = readFileSync(new URL("../../public/widget-loader.js", import.meta.url), "utf8");
export const APP_ORIGIN = "https://app.example.test";
export const WIDGET_KEY = "11111111-1111-4111-8111-111111111111";

/** A JSON fetch response. */
export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    body: null,
    json: async () => body,
  };
}

/**
 * A controllable SSE response. `push(event)` sends one frame, `end()` closes
 * cleanly, `drop()` makes the next read reject (connection dropped).
 */
export function sseResponse() {
  const encoder = new TextEncoder();
  const queue = [];
  const waiters = [];
  let ended = false;
  let failure = null;
  const settle = () => {
    while (waiters.length > 0) {
      const waiter = waiters[0];
      if (failure) {
        waiters.shift().reject(failure);
      } else if (queue.length > 0) {
        waiters.shift().resolve({ done: false, value: queue.shift() });
      } else if (ended) {
        waiters.shift().resolve({ done: true, value: undefined });
      } else {
        void waiter;
        return;
      }
    }
  };
  const response = {
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null) },
    body: {
      getReader() {
        return {
          read: () =>
            new Promise((resolve, reject) => {
              waiters.push({ resolve, reject });
              settle();
            }),
        };
      },
    },
    json: async () => null,
  };
  return {
    response,
    push(event) {
      queue.push(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      settle();
    },
    end() {
      ended = true;
      settle();
    },
    drop() {
      failure = new TypeError("network error");
      settle();
    },
  };
}

export function createLoaderHarness({
  fetchHandler,
  storage = new Map(),
  timeZone = "America/New_York",
  visibilityState = "visible",
} = {}) {
  const posted = [];
  const requests = [];
  const windowListeners = {};
  const documentListeners = {};
  const iframeListeners = {};
  let now = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers = new Map();

  const iframeWindow = {
    postMessage(message, targetOrigin) {
      posted.push({ message: JSON.parse(JSON.stringify(message)), targetOrigin });
    },
  };
  const iframe = {
    style: {},
    contentWindow: iframeWindow,
    setAttribute() {},
    addEventListener(type, fn) {
      (iframeListeners[type] ??= []).push(fn);
    },
  };
  const script = {
    src: `${APP_ORIGIN}/widget-loader.js`,
    getAttribute: (name) => (name === "data-widget-key" ? WIDGET_KEY : name === "data-position" ? "bottom-right" : null),
  };
  const documentStub = {
    currentScript: script,
    visibilityState,
    getElementsByTagName: () => [script],
    createElement: () => iframe,
    body: { appendChild() {} },
    addEventListener(type, fn) {
      (documentListeners[type] ??= []).push(fn);
    },
  };
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  let uuidCounter = 0;
  const windowStub = {
    location: { href: "https://host.example.test/page?x=1", origin: "https://host.example.test", pathname: "/page" },
    innerWidth: 1280,
    innerHeight: 800,
    localStorage,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) {
      (windowListeners[type] ??= []).push(fn);
    },
  };

  const fakeSetTimeout = (fn, ms) => {
    const id = nextTimerId++;
    timers.set(id, { fn, at: now + (ms ?? 0) });
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() {
      return now;
    }
  }
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const intlStub = {
    ...Intl,
    DateTimeFormat: function (...args) {
      const real = new RealDateTimeFormat(...args);
      return {
        format: (d) => real.format(d),
        resolvedOptions: () => ({ ...real.resolvedOptions(), timeZone }),
      };
    },
  };

  const fetchStub = (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    const record = { url, path: new URL(url).pathname, body, signal: init.signal ?? null };
    requests.push(record);
    const result = fetchHandler ? fetchHandler(record) : undefined;
    if (result === undefined) return new Promise(() => {}); // never settles
    if (init.signal) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
        Promise.resolve(result).then(resolve, reject);
      });
    }
    return Promise.resolve(result);
  };

  const context = vm.createContext({
    window: windowStub,
    document: documentStub,
    fetch: fetchStub,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    console,
    URL,
    JSON,
    Math,
    Date: FakeDate,
    Intl: intlStub,
    TextDecoder,
    TextEncoder,
    AbortController,
    Promise,
    Object,
    Array,
    Error,
    TypeError,
  });
  windowStub.document = documentStub;
  vm.runInContext(LOADER_SOURCE, context, { filename: "widget-loader.js" });

  const harness = {
    posted,
    requests,
    storage,
    iframe,
    get now() {
      return now;
    },
    postedOfType(type) {
      return posted.filter((entry) => entry.message.type === type).map((entry) => entry.message);
    },
    requestsTo(path) {
      return requests.filter((request) => request.path === path);
    },
    iframeLoad() {
      for (const fn of iframeListeners.load ?? []) fn();
    },
    fromIframe(data) {
      for (const fn of windowListeners.message ?? []) fn({ origin: APP_ORIGIN, source: iframeWindow, data });
    },
    setVisibility(state) {
      documentStub.visibilityState = state;
      for (const fn of documentListeners.visibilitychange ?? []) fn();
    },
    /** Lets pending promise chains run (several macrotask turns). */
    async flush(turns = 10) {
      for (let i = 0; i < turns; i++) await new Promise((resolve) => setImmediate(resolve));
    },
    /** Moves the fake clock forward, firing due timers in order (and flushing between them). */
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        let nextId = null;
        let nextAt = Infinity;
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < nextAt) {
            nextAt = timer.at;
            nextId = id;
          }
        }
        if (nextId === null) break;
        const timer = timers.get(nextId);
        timers.delete(nextId);
        now = Math.max(now, timer.at);
        timer.fn();
        await harness.flush();
      }
      now = target;
      await harness.flush();
    },
  };
  return harness;
}
