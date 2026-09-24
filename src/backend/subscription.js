import { BackendError, toBackendError } from "../domain/backend-errors.js";
import { isSubscriptionEvent, subscribeMessage } from "./protocol.js";

const BACKOFF_MS = Object.freeze([1000, 2000, 5000, 15000, 30000]);

function callbackSafely(callback, ...args) {
  if (typeof callback !== "function") return;
  try {
    callback(...args);
  } catch (_error) {
    // A consumer callback must not tear down the subscription loop.
  }
}

export function createSubscription({
  getHass,
  platform,
  onEvent,
  onStateChange,
  backoff = BACKOFF_MS,
} = {}) {
  let disposed = false;
  let started = false;
  let unsubscribe = null;
  let reconnectHandle = null;
  let attempt = 0;
  let lastCommit = null;
  let lastSequence = null;
  let state = "disconnected";
  const connection = getHass?.()?.connection ?? null;

  function setState(next, reason = null, detail = null) {
    state = next;
    callbackSafely(onStateChange, { state: next, reason, detail });
  }

  function clearReconnect() {
    if (reconnectHandle !== null && platform && typeof platform.clearTimeout === "function") {
      platform.clearTimeout(reconnectHandle);
    }
    reconnectHandle = null;
  }

  function detach() {
    const current = unsubscribe;
    unsubscribe = null;
    if (typeof current === "function") {
      try {
        current();
      } catch (_error) {
        // A stale HA unsubscribe handle is harmless during disposal/reconnect.
      }
    }
  }

  function scheduleReconnect(reason, detail = null) {
    if (disposed || reconnectHandle !== null) return;
    setState("reconnecting", reason, detail);
    const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 30000;
    attempt += 1;
    if (!platform || typeof platform.setTimeout !== "function") return;
    reconnectHandle = platform.setTimeout(() => {
      reconnectHandle = null;
      void connect();
    }, delay);
  }

  function received(event) {
    if (disposed) return;
    if (!isSubscriptionEvent(event)) {
      const error = new BackendError("invalid_response", "invalid subscription event");
      callbackSafely(onStateChange, { state: "snapshot_required", reason: "invalid_event", error });
      return;
    }
    const commit = event.commit_id;
    const sequence = event.sequence;
    const previousCommit = lastCommit;
    const previousSequence = lastSequence;
    const commitGap = previousCommit !== null && commit > previousCommit + 1;
    const sequenceGap = sequence !== undefined && previousSequence !== null && sequence > previousSequence + 1;
    if (commit <= (lastCommit ?? -1) || (sequence !== undefined && sequence <= (lastSequence ?? -1))) return;
    if (commitGap || sequenceGap) {
      lastCommit = commit;
      if (sequence !== undefined) lastSequence = sequence;
      callbackSafely(onStateChange, {
        state: "snapshot_required",
        reason: "commit_gap",
        detail: { previousCommit, commit, previousSequence, sequenceGap },
      });
      return;
    }
    lastCommit = commit;
    if (sequence !== undefined) lastSequence = sequence;
    callbackSafely(onEvent, event);
  }

  async function connect() {
    if (disposed || !connection || typeof connection.subscribeMessage !== "function") {
      setState("disconnected", "unavailable");
      return false;
    }
    started = true;
    try {
      const result = connection.subscribeMessage(received, subscribeMessage());
      const handle = result && typeof result.then === "function" ? await result : result;
      if (disposed) {
        if (typeof handle === "function") handle();
        return false;
      }
      unsubscribe = typeof handle === "function" ? handle : null;
      const reconnected = state === "reconnecting";
      attempt = 0;
      setState("connected", reconnected ? "reconnect" : null);
      if (reconnected) callbackSafely(onStateChange, { state: "snapshot_required", reason: "reconnect" });
      return true;
    } catch (error) {
      detach();
      const normalized = toBackendError(error, "connection");
      scheduleReconnect("subscribe_failed", normalized);
      return false;
    }
  }

  function disconnected(event) {
    if (disposed || !started) return;
    detach();
    scheduleReconnect("disconnect", event || null);
  }

  function connected() {
    if (!disposed && state !== "connected") void connect();
  }

  const listeners = [];
  if (connection && typeof connection.addEventListener === "function") {
    connection.addEventListener("disconnected", disconnected);
    connection.addEventListener("connected", connected);
    listeners.push(() => connection.removeEventListener?.("disconnected", disconnected));
    listeners.push(() => connection.removeEventListener?.("connected", connected));
  }

  function start() {
    if (started || disposed) return;
    void connect();
  }

  function stop() {
    clearReconnect();
    detach();
    for (const remove of listeners.splice(0)) remove();
    started = false;
    setState("disconnected", "stopped");
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
  }

  const result = { start, stop, dispose, getState: () => state, reconnect: () => connect() };
  start();
  return Object.freeze(result);
}

export { BACKOFF_MS };
