// Coalesces the integration's invalidation events. Every commit and every readiness change
// raises one event, which can arrive in bursts (a robot reporting its battery, a door sensor);
// a reload waits for a short quiet gap but never longer than `maxWaitMs` after the first event.

export const QUIET_MS = 250;
export const MAX_WAIT_MS = 2000;

export function createInvalidationTimer({ platform, onFire, quietMs = QUIET_MS, maxWaitMs = MAX_WAIT_MS } = {}) {
  let handle = null;
  let firstAt = null;

  function clear() {
    if (handle !== null) platform?.clearTimeout?.(handle);
    handle = null;
  }

  function fire() {
    clear();
    firstAt = null;
    onFire();
  }

  return Object.freeze({
    schedule() {
      if (typeof platform?.setTimeout !== "function") {
        onFire();
        return;
      }
      const now = platform.now();
      if (firstAt === null) firstAt = now;
      clear();
      const delay = Math.max(0, Math.min(quietMs, firstAt + maxWaitMs - now));
      handle = platform.setTimeout(fire, delay);
    },
    cancel() {
      clear();
      firstAt = null;
    },
    get pending() {
      return handle !== null;
    },
  });
}
