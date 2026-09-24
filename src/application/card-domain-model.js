// The one model every view reads. It joins the backend snapshot with the presentation context
// Home Assistant supplies (area and entity names, the current user, the clock) and adds
// nothing of its own. Pure and total: identical inputs give an identical frozen result.
// Shape contract: see internal dev doc §7 "CardDomainModel".

import { collectBackendDiagnostics } from "./source-diagnostics.js";

// A snapshot older than this is shown as possibly outdated. Only the caller knows the time,
// so staleness cannot be decided inside the store.
const STALE_AFTER_MS = 120_000;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function areaCatalog(areaRegistry) {
  const entries = areaRegistry && typeof areaRegistry === "object" ? Object.entries(areaRegistry) : [];
  const result = [];
  for (const [areaId, entry] of entries) {
    if (typeof areaId !== "string" || !areaId) continue;
    result.push({ areaId, name: entry?.name || areaId, icon: entry?.icon || "mdi:floor-plan" });
  }
  return result.sort((one, other) => one.name.localeCompare(other.name));
}

// Entity ids with a friendly name, for the requirement pickers and readiness explanations.
function entityCatalog(states) {
  const entries = states && typeof states === "object" ? Object.entries(states) : [];
  const result = [];
  for (const [entityId, state] of entries) {
    if (typeof entityId !== "string" || !entityId) continue;
    result.push({ entityId, name: state?.attributes?.friendly_name || entityId, state: state?.state ?? null });
  }
  return result;
}

function staleness(connection, nowMs) {
  const lastUpdatedAt = connection.lastUpdatedAt;
  if (connection.state !== "connected") return false;
  if (!Number.isFinite(lastUpdatedAt) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastUpdatedAt > STALE_AFTER_MS;
}

export function buildCardDomainModel({ backendState = {}, areaRegistry = null, states = null, user = null, nowMs = 0 } = {}) {
  const snapshot = backendState && typeof backendState === "object" ? backendState : {};
  const connectionState = snapshot.connection || {};
  const capabilities = snapshot.capabilities || {};
  const canCommand = user?.is_admin !== false;
  const stale = staleness(connectionState, nowMs);
  const areas = areaCatalog(areaRegistry);
  const entities = entityCatalog(states);

  const model = {
    connection: {
      state: connectionState.state || "connecting",
      stale,
      apiVersion: connectionState.apiVersion ?? null,
      integrationVersion: connectionState.integrationVersion ?? null,
      commitId: connectionState.commitId ?? null,
      queueRevision: connectionState.queueRevision ?? null,
      lastUpdatedAt: connectionState.lastUpdatedAt ?? null,
      lastError: connectionState.lastError ?? null,
      subscription: connectionState.subscription || "disconnected",
    },
    permissions: { canCommand, reason: canCommand ? null : "admin_required" },
    capabilities: { ...(capabilities.values || {}) },
    capabilityMeta: {
      negotiated: capabilities.negotiated === true,
      source: capabilities.source ?? null,
      limits: capabilities.limits ?? null,
    },
    queue: {
      available: snapshot.queue?.available === true,
      mode: snapshot.queue?.mode || "idle",
      revision: snapshot.queue?.revision ?? 0,
      needsAttention: snapshot.queue?.needsAttention === true,
      total: snapshot.queue?.total ?? 0,
      offset: snapshot.queue?.offset ?? 0,
      limit: snapshot.queue?.limit ?? 0,
      pending: snapshot.queue?.pending || [],
    },
    active: { available: snapshot.active?.available === true, jobs: snapshot.active?.jobs || [] },
    history: {
      available: snapshot.history?.available === true,
      jobs: snapshot.history?.jobs || [],
      total: snapshot.history?.total ?? 0,
      offset: snapshot.history?.offset ?? 0,
      limit: snapshot.history?.limit ?? 0,
    },
    attention: { available: snapshot.attention?.available === true, jobs: snapshot.attention?.jobs || [] },
    robots: { available: snapshot.robots?.available === true, items: snapshot.robots?.items || [] },
    areas: { available: snapshot.areas?.available === true, items: snapshot.areas?.items || [], catalog: areas },
    entities,
    // Command targets currently in flight, as the key set the action policy tests against.
    commands: { pending: Object.keys(snapshot.commands?.pending || {}) },
    lastCommandError: snapshot.lastCommandError ?? null,
    entityStatus: snapshot.entityStatus || { available: false },
    diagnostics: { warnings: [], hints: [] },
  };
  model.diagnostics = collectBackendDiagnostics({ model, backendDiagnostics: snapshot.diagnostics || [] });
  return deepFreeze(model);
}

export { STALE_AFTER_MS };
