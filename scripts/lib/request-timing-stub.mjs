// Pass-through stand-in for lib/request-timing.ts in suites that load server
// actions with an explicit dependency list. The real module has its own tests
// (scripts/run-perf-speed-tests.mjs); here timing must neither log nor change
// what the action does.
const timing = {
  time: (_stage, work) => work(),
  mark: () => {},
  elapsedMs: () => 0,
  finish: () => null,
};

export const requestTimingStub = {
  RequestTiming: class {
    time(_stage, work) { return work(); }
    mark() {}
    elapsedMs() { return 0; }
    finish() { return null; }
  },
  withRequestTiming: (_name, run) => run(timing),
  timingOutcomeForError: () => "error",
  markInstanceStart: () => {},
};
