// The one model every view reads. It joins the shared session snapshot with what Home Assistant
// supplies (areas, entity states, the user, registered actions) and the card's own scope
// requests. Pure and total; it is plain data so it can be compared by value.
// See internal dev doc §7 "CardDomainModel".

import { SUPPORTED_API_VERSIONS } from "../backend/protocol.js";
import { scopeKey } from "../backend/session.js";
import { collectSourceDiagnostics } from "./source-diagnostics.js";
import { indexRegistry, robotLive } from "./ha-entities.js";

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

// Entity ids the views name (readiness explanations, waiting reasons, conditions, occupancy
// sources), each with the further states they name: those a condition accepts.
function referencedEntities(slots) {
  const entities = new Map();
  const add = (id, values = []) => {
    if (!entities.has(id)) entities.set(id, new Set());
    for (const value of values) entities.get(id).add(value);
  };
  const addReadiness = (readiness) => {
    if (!readiness) return;
    for (const id of [...readiness.failedOn, ...readiness.failedOff, ...readiness.unknown]) add(id);
    for (const item of readiness.requirements) add(item.entityId);
  };
  const addBlockers = (blockers) => {
    for (const blocker of blockers || []) for (const id of blocker.entityIds) add(id);
  };
  const addJob = (job) => {
    if (!job) return;
    for (const id of job.requiredOn) add(id, ["on"]);
    for (const id of job.requiredOff) add(id, ["off"]);
    addReadiness(job.readiness);
    const waiting = job.waiting;
    if (!waiting) return;
    addBlockers([waiting, ...(waiting.job?.blockers || []), ...(waiting.queue?.blockers || [])]);
    for (const robot of [...(waiting.robots?.candidates || []), ...(waiting.robots?.unsuitable || [])]) addBlockers(robot.blockers);
  };
  for (const job of slots.queue?.data?.jobs || []) addJob(job);
  for (const job of slots.openJobs?.data?.jobs || []) addJob(job);
  addJob(slots.job?.data);
  for (const item of slots.execution?.data?.robots || []) addReadiness(item.readiness);
  for (const room of slots.rooms?.data?.items || []) {
    for (const requirement of room.requirements) add(requirement.entityId, requirement.acceptedStates);
    if (room.duePolicy.occupancyEntityId) add(room.duePolicy.occupancyEntityId);
  }
  for (const robot of slots.robots?.data?.items || []) for (const requirement of robot.configuration.requirements) add(requirement.entityId, requirement.acceptedStates);
  return new Map([...entities].sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0)));
}

// Home Assistant's wording, or null where it gives none.
function worded(format, state, value) {
  if (typeof format !== "function" || !state) return null;
  try {
    const text = format(state, value);
    return typeof text === "string" && text ? text : null;
  } catch {
    return null;
  }
}

function named(formatName, state) {
  if (typeof formatName !== "function" || !state) return null;
  try {
    const name = formatName(state);
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

// `values`: further states of the entity a view names, such as those a condition accepts; each
// is worded as Home Assistant words it.
function entityReading(states, entityId, format, values, formatName) {
  const state = states?.[entityId];
  return {
    state: state?.state ?? null,
    display: worded(format, state),
    name: named(formatName, state) || state?.attributes?.friendly_name || null,
    available: Boolean(state) && state.state !== "unavailable" && state.state !== "unknown",
    values: Object.fromEntries([...values].sort().map((value) => [value, worded(format, state, value)])),
  };
}

// Every entity as an editor option: id, name, domain. Built only while an editor needs it.
function entityCatalog(states) {
  if (!states || typeof states !== "object") return [];
  return Object.keys(states)
    .sort()
    .map((entityId) => ({ entityId, name: states[entityId]?.attributes?.friendly_name || entityId, domain: entityId.split(".")[0] }));
}

function watchedEntities(robotsLive, entityReadings) {
  const ids = new Set(Object.keys(entityReadings));
  for (const live of Object.values(robotsLive)) {
    for (const item of [live.vacuum, ...Object.values(live.roles), ...live.maps]) if (item?.entityId) ids.add(item.entityId);
  }
  return [...ids].sort();
}

// `home`: Home Assistant's facts as `readHomeAssistant` returns them.
export function buildCardDomainModel({ snapshot = null, requests = {}, home = null, nowMs = 0, needsEntityCatalog = false } = {}) {
  const slots = slotsFrom(snapshot, requests);
  const registry = indexRegistry(slots.registry?.data || []);
  const states = home?.states || null;
  const robots = slots.robots?.data?.items ?? null;
  const candidates = new Map((slots.candidates?.data?.items || []).map((candidate) => [candidate.registryId, candidate]));
  const robotsLive = {};
  for (const robot of robots || []) robotsLive[robot.robotId] = robotLive(robot, registry, states, candidates.get(robot.configuration.registryId), home?.formatState ?? null);
  const entityReadings = {};
  for (const [entityId, values] of referencedEntities(slots)) entityReadings[entityId] = entityReading(states, entityId, home?.formatState ?? null, values, home?.formatName ?? null);
  // The integration decides who may command; until it said so, nothing is withheld.
  const canCommand = slots.setup?.data?.mayCommand !== false;

  const model = {
    phase: snapshot?.phase ?? "probing",
    phaseFailure: snapshot?.phaseFailure ?? null,
    apiVersion: snapshot?.apiVersion ?? null,
    supportedApiVersions: [...SUPPORTED_API_VERSIONS],
    integrationVersion: slots.queue?.data?.integrationVersion ?? slots.manifest?.data?.version ?? null,
    errorTexts: slots.errorTexts?.data ?? null,
    runtime: snapshot?.runtime ?? { id: null, sequence: null, commitId: null },
    live: snapshot?.live ?? null,
    subscription: snapshot?.subscription ?? "idle",
    permissions: { canCommand, isAdmin: home?.admin === true },
    operations: [...(home?.operations || [])],
    pending: Object.keys(snapshot?.pending || {}).sort(),
    slots,
    robotsLive,
    entityReadings,
    areas: areaCatalog(home?.areas),
    entityCatalog: needsEntityCatalog ? entityCatalog(states) : [],
    // The entity states this model read; a change elsewhere does not change it.
    watched: { entityIds: watchedEntities(robotsLive, entityReadings), allStates: needsEntityCatalog },
    // The integration's setup status, or null until read.
    setup: slots.setup?.data ?? null,
    nowMs,
    diagnostics: { warnings: [], hints: [] },
  };
  model.diagnostics = collectSourceDiagnostics(model);
  return deepFreeze(model);
}
