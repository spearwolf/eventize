/**
 * Collect the rejections node reports as unowned while `run()` executes.
 *
 * The values `emitAsync()` gathers during a dispatch live in a local array, so
 * once that dispatch aborts nothing outside can attach a handler to them. What
 * is left to observe is the process-level report: run the throwing emit, let
 * node reach the turn in which it decides a rejection is unowned, and collect
 * whatever it announces.
 *
 * Two turns, not one: the first drains the microtask queue the rejection sits
 * in, the second is the one node reports from. The listener comes off again in
 * `finally` — a process-global handler left behind would swallow the reports of
 * every suite that runs after this one.
 *
 * Shared rather than copied: both dispatch paths of `emitAsync()` need this
 * measurement, and two copies of a two-turn timing dance drift apart the first
 * time one of them is tuned.
 */
export const unhandledRejectionsDuring = async (
  run: () => void,
): Promise<unknown[]> => {
  const reported: unknown[] = [];
  const collect = (reason: unknown) => {
    reported.push(reason);
  };
  process.on('unhandledRejection', collect);
  try {
    run();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', collect);
  }
  return reported;
};
