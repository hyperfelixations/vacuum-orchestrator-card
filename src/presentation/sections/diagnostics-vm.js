// What the card knows about its backend. This section displays source data; it never
// diagnoses it, and it is the one section that stays usable when nothing else does.

import { CAPABILITY_KEYS } from "../../backend/capabilities.js";
import { dateTime, duration, text } from "./helpers.js";

const CONNECTION_KEY = Object.freeze({
  connected: "status.idle",
  connecting: "status.reconnecting",
  reconnecting: "status.reconnecting",
  backend_missing: "status.notInstalled",
  backend_not_loaded: "status.notLoaded",
  api_incompatible: "status.incompatible",
  disconnected: "status.disconnected",
});

export function buildDiagnosticsViewModel({ model = {}, texts, nowMs = null, ui } = {}) {
  const connection = model.connection || {};
  const ageMs =
    connection.lastUpdatedAt === null || connection.lastUpdatedAt === undefined || !Number.isFinite(nowMs)
      ? null
      : Math.max(0, nowMs - connection.lastUpdatedAt);
  return {
    key: "diagnostics",
    connection: connection.state || "connecting",
    connectionLabel: text(texts, CONNECTION_KEY[connection.state] || CONNECTION_KEY.disconnected, undefined, connection.state),
    stale: connection.stale === true,
    apiVersion: connection.apiVersion,
    integrationVersion: connection.integrationVersion,
    commitId: connection.commitId,
    queueRevision: connection.queueRevision,
    subscription: connection.subscription,
    lastUpdatedLabel: dateTime(texts, connection.lastUpdatedAt),
    snapshotAgeLabel: ageMs === null ? "—" : duration(texts, ageMs),
    capabilities: CAPABILITY_KEYS.map((key) => ({
      key,
      label: text(texts, `capability.${key}`, undefined, key),
      available: model.capabilities?.[key] === true,
    })),
    capabilitySource: model.capabilityMeta?.source ?? null,
    readOnly: model.permissions?.canCommand === false,
    lastError: connection.lastError,
    lastCommandError: model.lastCommandError,
    ui,
  };
}
