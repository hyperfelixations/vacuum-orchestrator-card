// The one model every view reads. It joins the shared session snapshot with what Home Assistant
// supplies (areas, entity states, the user, registered actions) and the card's own scope
// requests. Pure and total; it is plain data so it can be compared by value.
// See internal dev doc §7 "CardDomainModel".

import { scopeKey } from "../backend/session.js";
import { collectSourceDiagnostics } from "./source-diagnostics.js";
import { indexRegistry, robotLive, summaryFrom } from "./ha-entities.js";
import { setupStatus } from "./setup-status.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

const EMPTY_SLOT = Object.freeze({ status: "idle", stale: false, data: null, error: null, loadedAt: null });

function slotsFrom(snapshot, requests) {
  const slots = {};
  for (const [slot, request] of Object.entries(requests || {})) {
    if (!request) continue;
    const scope = snapshot?.scopes?.[scopeKey(request.name, request.params || {})];
    slots[slot] = scope ? { status: scope.status, stale: scope.stale, data: scope.data, error: scope.error, loadedAt: scope.loadedAt } : EMPTY_SLOT;
  }
  return slots;
}

function areaCatalog(areas) {
  if (!areas || typeof areas !== "object") return [];
  return Object.entries(areas)
    .filter(([areaId]) => typeof areaId === "string" && areaId)
    .map(([areaId, area]) => ({ areaId, name: typeof area?.name === "string" && area.name.trim() ? area.name.trim() : areaId, icon: area?.icon || null, floorId: area?.floor_id || null }));
}

// Entity ids the views name: readiness explanations, conditions, occupancy sources.
function referencedEntityIds(slots) {
  const ids = new Set();
  const addReadiness = (readiness) => {
    if (!readiness) return;
    for (const id of [...readiness.failedOn, ...readiness.failedOff, ...readiness.unknown]) ids.add(id);
    for (const item of readiness.requirements) ids.add(item.entityId);
  };
  const addJob = (job) => {
    if (!job) return;
    for (const id of [...job.requiredOn, ...job.requiredOff]) ids.add(id);
    addReadiness(job.readiness);
  };
  for (const job of slots.queue?.data?.jobs || []) addJob(job);
  for (const job of slots.openJobs?.data?.jobs || []) addJob(job);
  addJob(slots.job?.data);
  for (const item of slots.execution?.data?.robots || []) addReadiness(item.readiness);
  for (const room of slots.rooms?.data?.items || []) {
    for (const requirement of room.requirements) ids.add(requirement.entityId);
    if (room.duePolicy.occupancyEntityId) ids.add(room.duePolicy.occupancyEntityId);
  }
  for (const robot of slots.robots?.data?.items || []) for (const requirement of robot.configuration.requirements) ids.add(requirement.entityId);
  return [...ids].sort();
}

function entityReading(states, entityId) {
  const state = states?.[entityId];
  return {
    state: state?.state ?? null,
    name: state?.attributes?.friendly_name || null,
    available: Boolean(state) && state.state !== "unavailable" && state.state !== "unknown",
  };
}

// Every entity as an editor option: id, name, domain. Built only while an editor needs it.
function entityCatalog(states) {
  if (!states || typeof states !== "object") return [];
  return Object.keys(states)
    .sort()
    .map((entityId) => ({ entityId, name: states[entityId]?.attributes?.friendly_name || entityId, domain: entityId.split(".")[0] }));
}

// `home`: Home Assistant's facts as `readHomeAssistant` returns them.
export function buildCardDomainModel({ snapshot = null, requests = {}, home = null, nowMs = 0, needsEntityCatalog = false } = {}) {
  const slots = slotsFrom(snapshot, requests);
  const registry = indexRegistry(slots.registry?.data || []);
  const states = home?.states || null;
  const robots = slots.robots?.data?.items ?? null;
  const rooms = slots.rooms?.data?.items ?? null;
  const candidates = new Map((slots.candidates?.data?.items || []).map((candidate) => [candidate.registryId, candidate]));
  const robotsLive = {};
  for (const robot of robots || []) robotsLive[robot.robotId] = robotLive(robot, registry, states, candidates.get(robot.configuration.registryId), home?.formatState ?? null);
  const entityReadings = {};
  for (const entityId of referencedEntityIds(slots)) entityReadings[entityId] = entityReading(states, entityId);
  const canCommand = home?.admin !== false;

  const model = {
    phase: snapshot?.phase ?? "probing",
    phaseFailure: snapshot?.phaseFailure ?? null,
    apiVersion: snapshot?.apiVersion ?? null,
    integrationVersion: slots.manifest?.data?.version ?? null,
    runtime: snapshot?.runtime ?? { id: null, sequence: null, commitId: null },
    live: snapshot?.live ?? null,
    subscription: snapshot?.subscription ?? "idle",
    permissions: { canCommand, isAdmin: home?.admin === true },
    operations: [...(home?.operations || [])],
    pending: Object.keys(snapshot?.pending || {}).sort(),
    slots,
    summary: summaryFrom(registry, states),
    robotsLive,
    entityReadings,
    areas: areaCatalog(home?.areas),
    entityCatalog: needsEntityCatalog ? entityCatalog(states) : [],
    setup: setupStatus({ robots, rooms, queueTotal: slots.queue?.data?.total ?? null, openJobs: slots.openJobs?.data?.jobs ?? null }),
    nowMs,
    diagnostics: { warnings: [], hints: [] },
  };
  model.diagnostics = collectSourceDiagnostics(model);
  return deepFreeze(model);
}
