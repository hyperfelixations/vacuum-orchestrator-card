// Readiness exactly as the integration reports it. The card never evaluates a requirement;
// it only orders the backend's explanation for display. "ready" does not mean a robot can run
// the job: that answer comes from the execution explanation.

import { isOperation, isReadinessState, isRequirementState } from "./job-schema.js";
import { enumerated, isRecord, records, strings, text, unknownFields } from "./wire-values.js";

const READINESS_FIELDS = new Set(["state", "failed_on", "failed_off", "unknown", "reason_codes", "blocked_room_ids", "requirements"]);

function requirementResult(wire) {
  const entityId = text(wire.entity_id);
  if (!entityId) return null;
  return Object.freeze({
    entityId,
    state: enumerated(wire.state, isRequirementState) ?? "unknown",
    reason: text(wire.reason),
    roomId: text(wire.room_id),
    robotId: text(wire.robot_id),
    operation: enumerated(wire.operation, isOperation),
  });
}

export function normalizeReadiness(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({
    state: enumerated(wire.state, isReadinessState) ?? "unknown",
    failedOn: strings(wire.failed_on),
    failedOff: strings(wire.failed_off),
    unknown: strings(wire.unknown),
    reasonCodes: strings(wire.reason_codes),
    blockedRoomIds: strings(wire.blocked_room_ids),
    requirements: Object.freeze(records(wire.requirements).map(requirementResult).filter(Boolean)),
    unknownFields: unknownFields(wire, READINESS_FIELDS),
  });
}

// The requirement results that explain a non-ready state, blocked before stale before unknown.
const PROBLEM_ORDER = Object.freeze({ blocked: 0, stale: 1, unknown: 2 });

export function readinessProblems(readiness) {
  if (!readiness) return Object.freeze([]);
  return Object.freeze(
    readiness.requirements
      .filter((item) => item.state !== "ready")
      .map((item, index) => ({ item, index }))
      .sort((one, other) => PROBLEM_ORDER[one.item.state] - PROBLEM_ORDER[other.item.state] || one.index - other.index)
      .map(({ item }) => item)
  );
}
