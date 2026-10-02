// Every error shape Home Assistant can hand back for a card request, reduced to one failure
// record. See internal dev doc §6 "Fehlervertrag".
//
// Shapes (home-assistant-js-websocket rejects with the error object of the result frame):
//   VOI WebSocket handlers        {code: <VOI code>, message}
//   configuration/* schema error  {code: "invalid_parameters"}
//   call_service domain error     {code: "service_validation_error", message: "Validation error: <code>[: <detail>]"}
//   call_service, not admin       {code: "home_assistant_error", message: "Unauthorized"}
//   admin-only WebSocket          {code: "unauthorized"}
//   unknown WebSocket type        {code: "unknown_command"}
//   unknown action                {code: "not_found", message: "Service <domain>.<service> not found."}
//   schema error                  {code: "invalid_format"}
//   connection lost               {type: "result", success: false, error: {code: 3}}

import { backendFailure, isBackendFailure } from "../domain/backend-errors.js";

const CONNECTION_LOST = 3;
const VALIDATION_PREFIX = /^Validation error:\s*/;
const CODE = /^[a-z][a-z0-9_]*$/;

function errorObject(error) {
  if (!error || typeof error !== "object") return null;
  if (error.error && typeof error.error === "object" && error.success === false) return error.error;
  return error;
}

// `<code>` or `<code>: <detail>` as the integration raises it.
function splitCodeMessage(message) {
  const value = String(message ?? "").trim();
  const separator = value.indexOf(":");
  const head = separator < 0 ? value : value.slice(0, separator).trim();
  if (!CODE.test(head)) return null;
  return { code: head, detail: separator < 0 ? null : value.slice(separator + 1).trim() || null };
}

export function decodeError(error, channel) {
  if (isBackendFailure(error)) return error;
  const frame = errorObject(error);
  if (!frame) return backendFailure("unknown", { detail: typeof error === "string" ? error : null, channel });
  const { code, message } = frame;
  if (code === CONNECTION_LOST) return backendFailure("connection_lost", { channel });
  if (code === "service_validation_error") {
    const parsed = splitCodeMessage(String(message ?? "").replace(VALIDATION_PREFIX, ""));
    return parsed ? backendFailure(parsed.code, { detail: parsed.detail, channel }) : backendFailure("invalid_request", { detail: message ?? null, channel });
  }
  if (code === "home_assistant_error") {
    if (String(message ?? "").trim() === "Unauthorized") return backendFailure("unauthorized", { channel });
    return backendFailure("unknown", { detail: message ?? null, channel });
  }
  if (code === "invalid_format") return backendFailure("invalid_request", { detail: message ?? null, channel });
  if (code === "not_found" && channel === "service") return backendFailure("service_not_found", { detail: message ?? null, channel });
  if (typeof code === "string" && code) {
    const parsed = splitCodeMessage(message);
    const detail = parsed && parsed.code === code ? parsed.detail : message && message !== code ? message : null;
    return backendFailure(code, { detail, channel });
  }
  return backendFailure("unknown", { detail: message ?? null, channel });
}
