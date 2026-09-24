import {
  BackendError,
  isBackendError,
  toBackendError,
} from "../domain/backend-errors.js";
import { createIdFactory } from "../core/ids.js";
import { ACTIONS, assertResponse, responseGuardFor } from "./protocol.js";

const DOMAIN = "vacuum_orchestrator";
const DEFAULT_TIMEOUT_MS = 10_000;
const RESPONSE_ACTIONS = new Set([
  ACTIONS.CREATE_JOB,
  ACTIONS.UPDATE_JOB,
  ACTIONS.START_JOB,
  ACTIONS.RUN_QUEUE,
  ACTIONS.RESUME_QUEUE,
  ACTIONS.RETRY_JOB,
]);

function safeTimer(platform, callback, delay) {
  if (!platform || typeof platform.setTimeout !== "function") return null;
  return platform.setTimeout(callback, delay);
}

function safeClearTimer(platform, handle) {
  if (handle !== null && platform && typeof platform.clearTimeout === "function") {
    platform.clearTimeout(handle);
  }
}

function withTimeout(promise, { platform, timeoutMs }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !platform?.setTimeout) return promise;
  return new Promise((resolve) => {
    let settled = false;
    const handle = safeTimer(platform, () => {
      if (settled) return;
      settled = true;
      resolve({ __backendTimeout: true });
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        safeClearTimer(platform, handle);
        resolve({ __backendValue: value });
      },
      (error) => {
        if (settled) return;
        settled = true;
        safeClearTimer(platform, handle);
        resolve({ __backendError: error });
      }
    );
  }).then((result) => {
    if (result.__backendTimeout) return new BackendError("timeout", `after ${timeoutMs} ms`);
    if (result.__backendError) throw result.__backendError;
    return result.__backendValue;
  });
}

function commandFailure(commandId, error) {
  const normalized = isBackendError(error) ? error : toBackendError(error, "connection");
  return Object.freeze({
    ok: false,
    commandId,
    code: normalized.code,
    group: normalized.group,
    detail: normalized.detail,
    error: normalized,
  });
}

function commandSuccess(commandId, data) {
  return Object.freeze({ ok: true, commandId, data: data ?? null });
}

function unwrapServiceResponse(raw) {
  if (raw && typeof raw === "object") {
    if (raw.error) return toBackendError(raw.error, "connection");
    if (raw.success === false) return toBackendError(raw, "connection");
    if (Object.prototype.hasOwnProperty.call(raw, "response")) return raw.response;
    if (Object.prototype.hasOwnProperty.call(raw, "service_response")) return raw.service_response;
  }
  return raw ?? null;
}

// `getHass` rather than a captured object: Home Assistant replaces the hass reference on every
// state update, and a captured one would go stale after the first render.
export function createClient({ getHass, platform, timeoutMs = DEFAULT_TIMEOUT_MS, ids = createIdFactory() } = {}) {
  let disposed = false;

  async function query(message, options = {}) {
    if (disposed) return new BackendError("orchestrator_not_loaded", "client disposed");
    const effectiveTimeout = options.timeoutMs ?? timeoutMs;
    const hass = getHass?.();
    try {
      const call =
        typeof hass?.callWS === "function"
          ? hass.callWS(message)
          : hass?.connection && typeof hass.connection.sendMessagePromise === "function"
            ? hass.connection.sendMessagePromise(message)
            : Promise.reject(new BackendError("orchestrator_not_loaded", "callWS unavailable"));
      const raw = await withTimeout(call, { platform, timeoutMs: effectiveTimeout });
      if (isBackendError(raw)) return raw;
      return assertResponse(raw, responseGuardFor(message), `invalid response for ${message?.type || "query"}`);
    } catch (error) {
      return toBackendError(error, "connection");
    }
  }

  async function command(action, data = {}, options = {}) {
    const commandId = ids.nextCommandId();
    if (disposed) return commandFailure(commandId, new BackendError("orchestrator_not_loaded", "client disposed"));
    const wantsResponse = options.response ?? RESPONSE_ACTIONS.has(action);
    const hass = getHass?.();
    try {
      let call;
      if (typeof hass?.callService === "function") {
        // Keep the documented HA signature: target is undefined and response is explicit.
        call = hass.callService(DOMAIN, action, data, undefined, false, wantsResponse);
      } else if (hass?.connection && typeof hass.connection.sendMessagePromise === "function") {
        call = hass.connection.sendMessagePromise({
          type: "call_service",
          domain: DOMAIN,
          service: action,
          service_data: data,
          return_response: true,
        });
      } else {
        return commandFailure(commandId, new BackendError("orchestrator_not_loaded", "callService unavailable"));
      }
      const raw = await withTimeout(call, { platform, timeoutMs: options.timeoutMs ?? timeoutMs });
      if (isBackendError(raw)) return commandFailure(commandId, raw);
      const dataOrError = unwrapServiceResponse(raw);
      if (isBackendError(dataOrError)) return commandFailure(commandId, dataOrError);
      return commandSuccess(commandId, dataOrError);
    } catch (error) {
      return commandFailure(commandId, toBackendError(error, "connection"));
    }
  }

  function dispose() {
    disposed = true;
  }

  return Object.freeze({ query, command, dispose });
}

export {
  DEFAULT_TIMEOUT_MS,
  DOMAIN,
  RESPONSE_ACTIONS,
  commandFailure,
  commandSuccess,
  unwrapServiceResponse,
};
