// Every error shape Home Assistant can hand back for a card request, reduced to one failure
// record. See internal dev doc §6 "Fehlervertrag".
//
// Shapes (home-assistant-js-websocket rejects with the error object of the result frame):
//   integration error, both channels  {code, message, translation_domain: "vacuum_orchestrator",
//                                       translation_key: <code>, translation_placeholders: {code, detail}}
//                                      (`code` is "service_validation_error" through call_service)
//   call_service, not admin           {code: "home_assistant_error", message: "Unauthorized"}
//   admin-only WebSocket              {code: "unauthorized"}
//   unknown WebSocket type            {code: "unknown_command"}
//   unknown action                    {code: "not_found", message: "Service <domain>.<service> not found."}
//   schema error                      {code: "invalid_format"}
//   connection lost                   {type: "result", success: false, error: {code: 3}}
//   socket not connected              3 (thrown by `Connection.sendMessage`)
// The message is English prose and is never parsed.

import { backendFailure, isBackendFailure } from "../domain/backend-errors.js";

const DOMAIN = "vacuum_orchestrator";
const CONNECTION_LOST = 3;

function errorObject(error) {
  if (!error || typeof error !== "object") return null;
  if (error.error && typeof error.error === "object" && error.success === false) return error.error;
  return error;
}

function integrationFailure(frame, channel) {
  if (frame.translation_domain !== DOMAIN || typeof frame.translation_key !== "string" || !frame.translation_key) return null;
  const detail = frame.translation_placeholders?.detail;
  return backendFailure(frame.translation_key, { detail: typeof detail === "string" && detail ? detail : null, channel });
}

export function decodeError(error, channel) {
  if (isBackendFailure(error)) return error;
  if (error === CONNECTION_LOST) return backendFailure("connection_lost", { channel });
  const frame = errorObject(error);
  if (!frame) return backendFailure("unknown", { detail: typeof error === "string" ? error : null, channel });
  const integration = integrationFailure(frame, channel);
  if (integration) return integration;
  const { code, message } = frame;
  if (code === CONNECTION_LOST) return backendFailure("connection_lost", { channel });
  if (code === "service_validation_error" || code === "invalid_format") return backendFailure("invalid_request", { detail: message ?? null, channel });
  if (code === "home_assistant_error") {
    if (String(message ?? "").trim() === "Unauthorized") return backendFailure("unauthorized", { channel });
    return backendFailure("unknown", { detail: message ?? null, channel });
  }
  if (code === "not_found" && channel === "service") return backendFailure("service_not_found", { detail: message ?? null, channel });
  if (typeof code === "string" && code) return backendFailure(code, { detail: message && message !== code ? message : null, channel });
  return backendFailure("unknown", { detail: message ?? null, channel });
}
