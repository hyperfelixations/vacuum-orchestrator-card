// The volatile backend snapshot. It owns no domain rules: it loads bounded pages, keeps the
// last confirmed answer, and serializes commands per target. Refreshes coalesce so a burst of
// commit notifications costs one reload. See internal dev doc §6 "Store und Synchronisation".

import { createDiagnostic } from "../core/diagnostics.js";
import { BackendError, isBackendError, toBackendError } from "../domain/backend-errors.js";
import { buildQueueModel } from "../domain/queue.js";
import { normalizeAreaStatus } from "../domain/areas.js";
import { normalizeRobotsResponse } from "../domain/robots.js";
import { CAPABILITY, NO_CAPABILITIES } from "./capabilities.js";
import { areasStatusMessage, jobsListMessage, queueGetMessage, robotsListMessage } from "./protocol.js";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SCOPES = Object.freeze(["queue", "history", "robots", "areas"]);

const CAPABILITY_BY_SCOPE = Object.freeze({
  queue: CAPABILITY.QUEUE_READ,
  history: CAPABILITY.JOBS_HISTORY,
  robots: CAPABILITY.ROBOTS_READ,
  areas: CAPABILITY.AREAS_READ,
});

// Diagnostics that describe the current connection rather than a past event. They are
// replaced on every transition instead of accumulating.
const TRANSIENT_CODES = Object.freeze([
  "backend.missing",
  "backend.not_loaded",
  "backend.api_incompatible",
  "backend.query_failed",
  "hint.reconnecting",
]);

const DIAGNOSTIC_BY_CONNECTION = Object.freeze({
  backend_missing: "backend.missing",
  backend_not_loaded: "backend.not_loaded",
  api_incompatible: "backend.api_incompatible",
  disconnected: "backend.query_failed",
  reconnecting: "hint.reconnecting",
});

function clockNow(clock) {
  if (typeof clock === "function") return Number(clock()) || 0;
  if (clock && typeof clock.now === "function") return Number(clock.now()) || 0;
  return 0;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function safeNotify(listener, payload) {
  if (typeof listener !== "function") return;
  try {
    listener(payload);
  } catch (_error) {
    // A consumer's render error must not stop backend synchronization.
  }
}

export function initialState() {
  return {
    connection: {
      state: "connecting",
      apiVersion: null,
      integrationVersion: null,
      commitId: null,
      queueRevision: null,
      lastUpdatedAt: null,
      lastError: null,
      subscription: "disconnected",
    },
    capabilities: clone(NO_CAPABILITIES),
    queue: { available: false, mode: "idle", revision: 0, commitId: null, needsAttention: false, total: 0, offset: 0, limit: 0, pending: [] },
    active: { available: false, jobs: [] },
    history: { available: false, jobs: [], total: 0, offset: 0, limit: 0 },
    attention: { available: false, jobs: [] },
    robots: { available: false, items: [] },
    areas: { available: false, items: [] },
    commands: { pending: {}, lastCommandId: null },
    lastCommandError: null,
    diagnostics: [],
    entityStatus: { available: false, queueMode: null, queueLength: null, activeJobs: null, attentionJobs: null, needsAttention: null },
  };
}

function scopeSet(scope) {
  if (scope === undefined || scope === null || scope === "all") return [...SCOPES];
  const requested = Array.isArray(scope) ? scope : [scope];
  return SCOPES.filter((item) => requested.includes(item));
}

function failureFor(commandId, error) {
  const normalized = isBackendError(error) ? error : toBackendError(error, "connection");
  return Object.freeze({ ok: false, commandId, code: normalized.code, group: normalized.group, detail: normalized.detail });
}

export function createStore({ client, clock, onChange, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const state = initialState();
  const pages = { queue: null, history: null };
  const requested = new Set();
  let disposed = false;
  let refreshRun = null;
  let commandCounter = 0;
  let configuredPageSize = pageSize;

  const getState = () => freeze(clone(state));
  const notify = () => safeNotify(onChange, getState());

  function replaceDiagnostic(code, params = null) {
    state.diagnostics = state.diagnostics.filter((entry) => entry.code !== code);
    if (code) state.diagnostics.push(createDiagnostic(code, { params }));
  }

  function clearTransient() {
    state.diagnostics = state.diagnostics.filter((entry) => !TRANSIENT_CODES.includes(entry.code));
  }

  function limitForPage() {
    const ceiling = Number.isInteger(state.capabilities.limits?.max_page_size)
      ? Math.min(MAX_PAGE_SIZE, state.capabilities.limits.max_page_size)
      : MAX_PAGE_SIZE;
    return Math.max(1, Math.min(ceiling, Number.isInteger(configuredPageSize) ? configuredPageSize : DEFAULT_PAGE_SIZE));
  }

  function setPageSize(value) {
    if (!Number.isInteger(value) || value === configuredPageSize) return;
    configuredPageSize = value;
  }

  function setConnection(patch) {
    for (const [key, value] of Object.entries(patch || {})) {
      if (value !== undefined) state.connection[key] = value;
    }
    clearTransient();
    const code = DIAGNOSTIC_BY_CONNECTION[state.connection.state];
    if (code) state.diagnostics.push(createDiagnostic(code, { params: { code: state.connection.lastError?.code ?? null } }));
    notify();
  }

  function setCapabilities(snapshot) {
    state.capabilities = clone(snapshot || NO_CAPABILITIES);
    if (state.capabilities.apiVersion !== null) state.connection.apiVersion = state.capabilities.apiVersion;
    if (state.capabilities.integrationVersion !== null) state.connection.integrationVersion = state.capabilities.integrationVersion;
    notify();
  }

  function markCapability(capability, supported) {
    if (state.capabilities.values[capability] === Boolean(supported)) return;
    state.capabilities = {
      ...state.capabilities,
      values: { ...state.capabilities.values, [capability]: Boolean(supported) },
    };
    notify();
  }

  const hasCapability = (capability) => state.capabilities.values[capability] === true;

  function markLoaded() {
    state.connection.lastUpdatedAt = clockNow(clock);
    state.connection.lastError = null;
    if (state.connection.state !== "connected") {
      state.connection.state = "connected";
      clearTransient();
    }
  }

  function applyQueueModel() {
    const model = buildQueueModel({ queuePage: pages.queue, registryPage: pages.history });
    if (pages.queue) {
      state.queue = {
        available: true,
        mode: model.mode,
        revision: model.revision,
        commitId: model.commitId,
        needsAttention: model.needsAttention || model.attention.length > 0,
        total: model.total,
        offset: model.offset,
        limit: model.limit,
        pending: [...model.pending],
      };
      state.connection.commitId = model.commitId;
      state.connection.queueRevision = model.revision;
    }
    if (pages.history) {
      state.history = {
        available: true,
        jobs: [...model.history],
        total: model.registry.total,
        offset: model.registry.offset,
        limit: model.registry.limit,
      };
      state.active = { available: true, jobs: [...model.active] };
      state.attention = { available: true, jobs: [...model.attention] };
    }
  }

  function applyPage(scope, response) {
    if (scope === "queue" || scope === "history") {
      pages[scope] = response;
      applyQueueModel();
    } else if (scope === "robots") {
      const normalized = normalizeRobotsResponse(response);
      if (!normalized) throw new BackendError("invalid_response", "robots response");
      state.robots = { available: true, items: [...normalized.robots] };
    } else if (scope === "areas") {
      if (!response || !Array.isArray(response.areas)) throw new BackendError("invalid_response", "areas response");
      state.areas = { available: true, items: response.areas.map(normalizeAreaStatus).filter(Boolean) };
    }
    markLoaded();
  }

  // A backend that does not know an optional query answers `unknown_command`. That is a
  // capability fact, not a failure: record it and stop asking.
  function recordQueryError(scope, error) {
    const normalized = isBackendError(error) ? error : toBackendError(error, "connection");
    if (normalized.code === "unknown_command") {
      const capability = CAPABILITY_BY_SCOPE[scope];
      if (capability) markCapability(capability, false);
      return;
    }
    state.connection.lastError = { scope, code: normalized.code, group: normalized.group, detail: normalized.detail };
    replaceDiagnostic("backend.query_failed", { scope, code: normalized.code });
  }

  function messageFor(scope, offset) {
    if (scope === "queue") return queueGetMessage({ offset, limit: limitForPage() });
    if (scope === "history") return jobsListMessage({ offset, limit: limitForPage() });
    if (scope === "robots") return robotsListMessage();
    if (scope === "areas") return areasStatusMessage();
    return null;
  }

  async function loadOne(scope, offset = 0) {
    if (disposed || typeof client?.query !== "function") return getState();
    const capability = CAPABILITY_BY_SCOPE[scope];
    if (state.capabilities.negotiated && capability && !hasCapability(capability)) return getState();
    const message = messageFor(scope, offset);
    if (!message) return getState();
    const response = await client.query(message);
    try {
      if (isBackendError(response)) recordQueryError(scope, response);
      else applyPage(scope, response);
    } catch (error) {
      recordQueryError(scope, error);
    }
    notify();
    return getState();
  }

  function refresh(scope = "all") {
    if (disposed) return Promise.resolve(getState());
    for (const item of scopeSet(scope)) requested.add(item);
    if (refreshRun) return refreshRun;
    refreshRun = (async () => {
      while (requested.size && !disposed) {
        const scopes = SCOPES.filter((item) => requested.has(item));
        requested.clear();
        for (const item of scopes) await loadOne(item, 0);
      }
      return getState();
    })().finally(() => {
      refreshRun = null;
    });
    return refreshRun;
  }

  function setEntityStatus(status) {
    state.entityStatus = clone(status || initialState().entityStatus);
    notify();
  }

  // A commit notification carries counters only; the pages themselves are reloaded.
  function recordEvent(event) {
    if (!event || typeof event !== "object") return;
    if (Number.isInteger(event.commit_id)) state.connection.commitId = event.commit_id;
    if (Number.isInteger(event.queue_revision)) state.connection.queueRevision = event.queue_revision;
    if (typeof event.mode === "string") state.queue.mode = event.mode;
    if (Number.isInteger(event.pending_jobs)) state.queue.total = event.pending_jobs;
    state.queue.needsAttention = event.needs_attention === true;
    notify();
  }

  function setSubscriptionState(change) {
    const next = typeof change === "string" ? change : change?.state;
    if (!next) return;
    state.connection.subscription = next;
    if (next === "connected") setConnection({ state: "connected" });
    else if (next === "reconnecting") setConnection({ state: "reconnecting" });
    else if (next === "disconnected") setConnection({ state: "disconnected" });
    else notify();
  }

  // One outstanding command per target. A second request for the same target is refused
  // locally with `command_pending`, never sent twice.
  async function executeCommand({ target, action, data = {}, refreshScopes = "all" } = {}) {
    const key = target || action || "command";
    const commandId = `voc-${++commandCounter}`;
    if (disposed) return failureFor(commandId, new BackendError("orchestrator_not_loaded", "backend disposed"));
    if (state.commands.pending[key]) {
      return Object.freeze({ ok: false, commandId, code: "command_pending", group: "client", detail: key });
    }
    state.commands.pending = { ...state.commands.pending, [key]: { commandId, action } };
    state.commands.lastCommandId = commandId;
    notify();
    let result;
    try {
      result = await client.command(action, data);
    } catch (error) {
      result = failureFor(commandId, error);
    }
    const pending = { ...state.commands.pending };
    delete pending[key];
    state.commands.pending = pending;
    if (!result || result.ok !== true) {
      const failure = result?.ok === false ? result : failureFor(commandId, result);
      state.lastCommandError = { commandId: failure.commandId || commandId, action, target: key, code: failure.code, group: failure.group, detail: failure.detail ?? null };
      replaceDiagnostic("command.failed", { code: failure.code, action });
      notify();
      return Object.freeze({ ...failure, commandId: failure.commandId || commandId });
    }
    state.lastCommandError = null;
    state.diagnostics = state.diagnostics.filter((entry) => entry.code !== "command.failed");
    await refresh(refreshScopes);
    notify();
    return Object.freeze({ ok: true, commandId: result.commandId || commandId, data: result.data ?? null });
  }

  function dispose() {
    disposed = true;
    requested.clear();
  }

  return Object.freeze({
    getState,
    refresh,
    loadPage: (scope, offset = 0) => loadOne(scope, offset),
    setPageSize,
    setConnection,
    setCapabilities,
    markCapability,
    hasCapability,
    setEntityStatus,
    recordEvent,
    setSubscriptionState,
    executeCommand,
    dispose,
  });
}

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, clockNow };
