// Canonical rooms as the integration presents them: identity, policy, grant, due verdicts and
// cleaning stamps. Due state, release admission and quality are backend verdicts; the card
// presents them and computes nothing. See internal dev doc §7 "Raummodell".

import { isCompletionQuality, isDueBasis, isDueState, isOperation, isReleaseKind } from "./job-schema.js";
import { bool, enumerated, finite, instant, integer, isRecord, records, strings, text, unknownFields } from "./wire-values.js";

const ROOM_FIELDS = new Set([
  "api_version",
  "room_id",
  "name",
  "area_id",
  "floor_id",
  "enabled",
  "area_missing",
  "follow_area_name",
  "bindings",
  "requirements",
  "release",
  "due_policy",
  "occupancy",
  "last_cleaning",
  "last_confirmed",
  "released",
  "due",
]);

export const DUE_OPERATIONS = Object.freeze(["vacuum", "mop"]);

function binding(wire) {
  const robotId = text(wire.robot_id);
  const targetIds = strings(wire.target_ids);
  if (!robotId || targetIds.length === 0) return null;
  return Object.freeze({ robotId, targetIds, mapId: text(wire.map_id) });
}

export function normalizeRequirement(wire) {
  if (!isRecord(wire)) return null;
  const entityId = text(wire.entity_id);
  if (!entityId) return null;
  return Object.freeze({
    entityId,
    acceptedStates: strings(wire.accepted_states),
    maxAgeSeconds: finite(wire.max_age_seconds),
    robotId: text(wire.robot_id),
    operation: enumerated(wire.operation, isOperation),
    entityRegistryId: text(wire.entity_registry_id),
  });
}

function release(wire) {
  if (!isRecord(wire)) return null;
  const grantId = text(wire.grant_id);
  const kind = enumerated(wire.kind, isReleaseKind);
  if (!grantId || !kind) return null;
  return Object.freeze({
    grantId,
    kind,
    grantedAt: instant(wire.granted_at),
    expiresAt: instant(wire.expires_at),
    reservedJobId: text(wire.reserved_job_id),
    consumed: wire.consumed === true,
    queueRunId: text(wire.queue_run_id),
  });
}

function duePolicy(wire) {
  const value = isRecord(wire) ? wire : {};
  return Object.freeze({
    basis: enumerated(value.basis, isDueBasis) ?? "calendar",
    vacuumSeconds: finite(value.vacuum_seconds),
    mopSeconds: finite(value.mop_seconds),
    occupancyEntityId: text(value.occupancy_entity_id),
    occupiedState: text(value.occupied_state),
    unoccupiedState: text(value.unoccupied_state),
    occupancyEntityRegistryId: text(value.occupancy_entity_registry_id),
  });
}

function occupancy(wire) {
  const value = isRecord(wire) ? wire : {};
  return Object.freeze({
    epoch: integer(value.epoch),
    occupiedSeconds: finite(value.occupied_seconds),
    unknownSeconds: finite(value.unknown_seconds),
    observedAt: instant(value.observed_at),
    occupied: bool(value.occupied),
  });
}

function stamp(wire) {
  if (!isRecord(wire)) return null;
  const completedAt = instant(wire.completed_at);
  if (completedAt === null) return null;
  return Object.freeze({
    receiptId: text(wire.receipt_id),
    completedAt,
    quality: enumerated(wire.quality, isCompletionQuality),
    occupancyBaselineKnown: wire.occupancy_baseline_known !== false,
  });
}

function stamps(wire) {
  const value = isRecord(wire) ? wire : {};
  return Object.freeze(Object.fromEntries(DUE_OPERATIONS.map((operation) => [operation, stamp(value[operation])])));
}

function dueReport(wire) {
  if (!isRecord(wire)) return Object.freeze({ state: "unknown", reason: null, elapsedSeconds: null, remainingSeconds: null, dueAt: null, quality: null });
  return Object.freeze({
    state: enumerated(wire.state, isDueState) ?? "unknown",
    reason: text(wire.reason),
    elapsedSeconds: finite(wire.elapsed_seconds),
    remainingSeconds: finite(wire.remaining_seconds),
    dueAt: instant(wire.due_at),
    quality: enumerated(wire.quality, isCompletionQuality),
  });
}

export function normalizeRoom(wire) {
  if (!isRecord(wire)) return null;
  const roomId = text(wire.room_id);
  if (!roomId) return null;
  const due = isRecord(wire.due) ? wire.due : {};
  return Object.freeze({
    roomId,
    name: text(wire.name) ?? roomId,
    areaId: text(wire.area_id),
    floorId: text(wire.floor_id),
    enabled: wire.enabled !== false,
    areaMissing: wire.area_missing === true,
    followAreaName: wire.follow_area_name !== false,
    bindings: Object.freeze(records(wire.bindings).map(binding).filter(Boolean)),
    requirements: Object.freeze(records(wire.requirements).map(normalizeRequirement).filter(Boolean)),
    release: release(wire.release),
    released: wire.released === true,
    duePolicy: duePolicy(wire.due_policy),
    occupancy: occupancy(wire.occupancy),
    lastCleaning: stamps(wire.last_cleaning),
    lastConfirmed: stamps(wire.last_confirmed),
    due: Object.freeze(Object.fromEntries(DUE_OPERATIONS.map((operation) => [operation, dueReport(due[operation])]))),
    unknownFields: unknownFields(wire, ROOM_FIELDS),
  });
}
