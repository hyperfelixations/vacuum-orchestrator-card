// Per-area cleaning status as the backend reports it. Due dates and freshness evidence are
// backend facts; the card only presents them.

import { parseInstant } from "../core/time.js";

const DUE_STATES = new Set(["clean", "vacuum_due", "mop_due", "both_due", "unknown"]);
const WIRE_FIELDS = new Set([
  "area_id",
  "last_vacuumed_at",
  "last_mopped_at",
  "vacuum_due_at",
  "mop_due_at",
  "due_state",
  "release_entity_id",
  "blocking_entity_ids",
  "open_job_ids",
]);

function strings(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return Object.freeze(result);
}

// The backend's own verdict wins. Only where it is absent does the card derive one from the
// due dates, and then it needs the current time from its caller.
export function dueState(status, nowMs) {
  if (!status || typeof status !== "object") return "unknown";
  if (DUE_STATES.has(status.dueState)) return status.dueState;
  const now = Number.isFinite(nowMs) ? nowMs : null;
  if (now === null) return "unknown";
  const vacuumDue = status.vacuumDueAt !== null && status.vacuumDueAt <= now;
  const mopDue = status.mopDueAt !== null && status.mopDueAt <= now;
  if (vacuumDue && mopDue) return "both_due";
  if (vacuumDue) return "vacuum_due";
  if (mopDue) return "mop_due";
  if (status.vacuumDueAt !== null || status.mopDueAt !== null) return "clean";
  return "unknown";
}

export function normalizeAreaStatus(wire) {
  if (!wire || typeof wire !== "object") return null;
  const areaId = typeof wire.area_id === "string" ? wire.area_id.trim() : "";
  if (!areaId) return null;
  return Object.freeze({
    areaId,
    lastVacuumedAt: parseInstant(wire.last_vacuumed_at),
    lastMoppedAt: parseInstant(wire.last_mopped_at),
    vacuumDueAt: parseInstant(wire.vacuum_due_at),
    mopDueAt: parseInstant(wire.mop_due_at),
    dueState: DUE_STATES.has(wire.due_state) ? wire.due_state : null,
    releaseEntityId: typeof wire.release_entity_id === "string" ? wire.release_entity_id : null,
    blockingEntityIds: strings(wire.blocking_entity_ids),
    openJobIds: strings(wire.open_job_ids),
    unknownFields: Object.freeze(Object.keys(wire).filter((key) => !WIRE_FIELDS.has(key))),
  });
}
