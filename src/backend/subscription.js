// Coalesces the integration's invalidation events. Every commit and every readiness change
// raises one event, which can arrive in bursts (a robot reporting its battery, a door sensor);
// a reload waits for a short quiet gap but never longer than `maxWaitMs` after the first event.
// A burst reloads the union of the scopes its events named, up to its newest sequence.

export const QUIET_MS = 250;
export const MAX_WAIT_MS = 2000;

const EVERYTHING = Object.freeze({ scopes: "all", sequence: null });

function merge(pending, change) {
  if (!pending) return change;
  const scopes = pending.scopes === "all" || change.scopes === "all" ? "all" : new Set([...pending.scopes, ...change.scopes]);
  const sequences = [pending.sequence, change.sequence].filter(Number.isInteger);
  return { scopes, sequence: sequences.length ? Math.max(...sequences) : null };
}

export function createInvalidationTimer({ platform, onFire, quietMs = QUIET_MS, maxWaitMs = MAX_WAIT_MS } = {}) {
  let handle = null;
  let firstAt = null;
  let pending = null;

  function clear() {
    if (handle !== null) platform?.clearTimeout?.(handle);
    handle = null;
  }

  function fire() {
    const change = pending ?? EVERYTHING;
    clear();
    firstAt = null;
    pending = null;
    onFire(change);
  }

  return Object.freeze({
    // `change`: `{scopes, sequence}`, with `scopes` a set of scope names or "all".
    schedule(change = EVERYTHING) {
      pending = merge(pending, change);
      if (typeof platform?.setTimeout !== "function") {
        fire();
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
      pending = null;
    },
    get pending() {
      return handle !== null;
    },
  });
}
