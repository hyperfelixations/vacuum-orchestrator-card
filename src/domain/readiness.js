// Readiness as the backend reports it. The card never evaluates requirements itself.

import { isReadinessState } from "./job-schema.js";

const WIRE_FIELDS = new Set(["state", "failed_on", "failed_off", "unknown"]);

function orderedUniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

export function normalizeReadiness(wire) {
  if (!wire || typeof wire !== "object") return null;
  return Object.freeze({
    state: isReadinessState(wire.state) ? wire.state : "unknown",
    failedOn: orderedUniqueStrings(wire.failed_on),
    failedOff: orderedUniqueStrings(wire.failed_off),
    unknown: orderedUniqueStrings(wire.unknown),
    unknownFields: Object.freeze(Object.keys(wire).filter((key) => !WIRE_FIELDS.has(key))),
  });
}

// The entities that explain a non-ready state, blocked ones before unknown ones.
export function readinessSummary(report) {
  const value = report && typeof report === "object" ? report : null;
  const failedOn = value?.failedOn ?? [];
  const failedOff = value?.failedOff ?? [];
  const unknown = value?.unknown ?? [];
  const reasonKeys = [];
  if (failedOn.length || failedOff.length) reasonKeys.push("blockedBy");
  if (unknown.length) reasonKeys.push("unknownEntities");
  const entities = [];
  const seen = new Set();
  for (const entity of [...failedOn, ...failedOff, ...unknown]) {
    if (seen.has(entity)) continue;
    seen.add(entity);
    entities.push(entity);
  }
  return Object.freeze({
    state: value?.state ?? "unknown",
    reasonKeys: Object.freeze(reasonKeys),
    entities: Object.freeze(entities),
  });
}
