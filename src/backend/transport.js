// The card's only path to Home Assistant's connection. It sends WebSocket messages and action
// calls, owns timeouts, and turns every rejection into one failure record. `getHass` is read on
// each call because Home Assistant replaces the hass object on every state change.

import { backendFailure, isBackendFailure } from "../domain/backend-errors.js";
import { decodeError } from "./error-decoding.js";

export const DOMAIN = "vacuum_orchestrator";
export const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout(promise, platform, timeoutMs, channel) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof platform?.setTimeout !== "function") return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const handle = platform.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(backendFailure("timeout", { detail: `${timeoutMs} ms`, channel }));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        platform.clearTimeout?.(handle);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        platform.clearTimeout?.(handle);
        reject(error);
      }
    );
  });
}

const ok = (data) => Object.freeze({ ok: true, data: data ?? null });

export function createTransport({ getHass, platform, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let disposed = false;
  const hass = () => (disposed ? null : getHass?.() ?? null);

  async function settle(channel, start, limit) {
    if (disposed) return backendFailure("connection_lost", { detail: "disposed", channel });
    try {
      const call = start();
      if (isBackendFailure(call)) return call;
      return ok(await withTimeout(call, platform, limit ?? timeoutMs, channel));
    } catch (error) {
      return decodeError(error, channel);
    }
  }

  // Resolves to `{ ok: true, data }` or a failure record; never rejects.
  function ws(message, { timeoutMs: limit } = {}) {
    return settle("ws", () => {
      const current = hass();
      if (typeof current?.callWS === "function") return current.callWS(message);
      if (typeof current?.connection?.sendMessagePromise === "function") return current.connection.sendMessagePromise(message);
      return backendFailure("connection_lost", { detail: "no connection", channel: "ws" });
    }, limit);
  }

  // Integration actions. `data` of the result is the action response, or null without one.
  async function service(name, data = {}, { returnResponse = false, timeoutMs: limit } = {}) {
    const result = await settle("service", () => {
      const current = hass();
      if (typeof current?.callService === "function") return current.callService(DOMAIN, name, data, undefined, false, returnResponse);
      if (typeof current?.connection?.sendMessagePromise === "function") {
        return current.connection.sendMessagePromise({ type: "call_service", domain: DOMAIN, service: name, service_data: data, return_response: returnResponse });
      }
      return backendFailure("connection_lost", { detail: "no connection", channel: "service" });
    }, limit);
    if (!result.ok) return result;
    const response = result.data && typeof result.data === "object" && "response" in result.data ? result.data.response : null;
    return ok(returnResponse ? response : null);
  }

  // Resolves to `{ ok: true, data: unsubscribe }` or a failure record. The connection library
  // re-subscribes by itself after a reconnect.
  function subscribe(message, onEvent) {
    return settle("ws", () => {
      const connection = hass()?.connection;
      if (typeof connection?.subscribeMessage !== "function") return backendFailure("connection_lost", { detail: "no connection", channel: "ws" });
      return connection.subscribeMessage(onEvent, message);
    });
  }

  // Connection lifecycle: "ready" after every (re)connect, "disconnected" on loss.
  function onConnection(eventName, listener) {
    const connection = hass()?.connection;
    if (typeof connection?.addEventListener !== "function") return () => {};
    connection.addEventListener(eventName, listener);
    return () => connection.removeEventListener?.(eventName, listener);
  }

  return Object.freeze({
    ws,
    service,
    subscribe,
    onConnection,
    connection: () => hass()?.connection ?? null,
    dispose() {
      disposed = true;
    },
  });
}
