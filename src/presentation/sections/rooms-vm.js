// Per-room cleaning status. Every value is a backend fact; the card derives only the bar
// position, and only where the backend gave both a last-cleaned and a due timestamp.

import { dueState as resolveDueState } from "../../domain/areas.js";
import { areaLabel, areaMap, dateTime, duration, entityLabel, entityMap, hasCapability, listOf, text } from "./helpers.js";

// Share of the interval between the last cleaning and the next due date that has elapsed.
function progressFor(lastAt, dueAt, nowMs) {
  if (lastAt === null || dueAt === null || !Number.isFinite(nowMs) || dueAt <= lastAt) return null;
  return Math.min(1, Math.max(0, (nowMs - lastAt) / (dueAt - lastAt)));
}

function buildRoom(status, { areasById, entitiesById, texts, nowMs }) {
  const dueState = resolveDueState(status, nowMs);
  const nextDueAt = [status.vacuumDueAt, status.mopDueAt].filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null;
  const lastAt = [status.lastVacuumedAt, status.lastMoppedAt].filter((value) => value !== null).sort((a, b) => b - a)[0] ?? null;
  const remainingMs = nextDueAt === null || !Number.isFinite(nowMs) ? null : nextDueAt - nowMs;
  const release = status.releaseEntityId ? entitiesById.get(status.releaseEntityId) : null;

  return {
    key: status.areaId,
    areaId: status.areaId,
    name: areaLabel(status.areaId, areasById),
    icon: areasById.get(status.areaId)?.icon || "mdi:floor-plan",
    lastVacuumedLabel: dateTime(texts, status.lastVacuumedAt),
    lastMoppedLabel: dateTime(texts, status.lastMoppedAt),
    hasSchedule: nextDueAt !== null,
    dueState,
    dueStateLabel: text(texts, `room.due.${dueState}`, undefined, dueState),
    remainingMs,
    remainingLabel: remainingMs === null ? "—" : duration(texts, Math.abs(remainingMs)),
    overdue: remainingMs !== null && remainingMs < 0,
    progress: progressFor(lastAt, nextDueAt, nowMs),
    release: status.releaseEntityId
      ? {
          entityId: status.releaseEntityId,
          label: entityLabel(status.releaseEntityId, entitiesById),
          state: release?.state ?? null,
          checked: release?.state === "on",
          available: Boolean(release),
        }
      : null,
    blockingEntities: status.blockingEntityIds.map((entityId) => ({ id: entityId, label: entityLabel(entityId, entitiesById) })),
    openJobIds: status.openJobIds,
  };
}

export function buildRoomsViewModel({ model = {}, texts, nowMs = null, ui } = {}) {
  if (!hasCapability(model, "areasRead")) {
    return { key: "rooms", available: false, unavailable: { capability: "areasRead" }, rows: [], empty: false, ui };
  }
  const shared = { areasById: areaMap(model), entitiesById: entityMap(model), texts, nowMs };
  const rows = listOf(model.areas?.items).map((status) => buildRoom(status, shared));
  return { key: "rooms", available: true, unavailable: null, rows, empty: rows.length === 0, ui };
}
