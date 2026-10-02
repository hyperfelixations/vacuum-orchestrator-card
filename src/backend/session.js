// One backend session per Home Assistant connection, shared by every card on it. It finds out
// whether the integration is installed, set up and compatible, keeps one live subscription,
// loads exactly the scopes some card currently shows, and sends commands one per target.
// It holds no domain rule. See internal dev doc §6 "Sitzung".

import { backendFailure, isBackendFailure } from "../domain/backend-errors.js";
import { ACTIONS, CONFIGURATION_COMMANDS, guards, messages } from "./protocol.js";
import { SCOPE_LOADERS } from "./scopes.js";
import { createInvalidationTimer } from "./subscription.js";

export const DOMAIN = "vacuum_orchestrator";

// Phases of the connection to the integration, in the order a fresh install passes them.
export const PHASES = Object.freeze(["probing", "not_installed", "not_set_up", "load_failed", "api_incompatible", "offline", "ready"]);

export const HEARTBEAT_MS = 30_000;

// Home Assistant's own data and the robot discovery derived from its entity registry; the
// integration's invalidation events do not concern them.
const HOME_ASSISTANT_SCOPES = new Set(["registry", "manifest", "candidates"]);
const ENTITY_REGISTRY_SCOPES = Object.freeze(["registry", "candidates"]);

const LOAD_FAILED_CODES = new Set(["orchestrator_not_loaded", "orchestrator_not_initialized", "orchestrator_shutting_down", "multiple_orchestrator_entries_loaded"]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export function scopeKey(name, params = {}) {
  return `${name}|${stableJson(params)}`;
}

export function componentLoaded(hass) {
  const components = hass?.config?.components;
  if (!components) return false;
  if (typeof components.includes === "function") return components.includes(DOMAIN);
  if (typeof components.has === "function") return components.has(DOMAIN);
  return false;
}

export function registeredOperations(hass) {
  const services = hass?.services?.[DOMAIN];
  return new Set(services && typeof services === "object" ? Object.keys(services) : []);
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

export function createSession({ transport, platform, getHass } = {}) {
  const scopes = new Map();
  const demands = new Map();
  const pending = new Map();
  const listeners = new Set();
  const cleanups = [];
  let phase = "probing";
  let phaseFailure = null;
  let apiVersion = null;
  let runtime = { id: null, sequence: null, commitId: null };
  let live = null;
  let subscription = "idle";
  let unsubscribe = null;
  let probing = null;
  let wasLoaded = null;
  let disposed = false;
  let version = 0;
  let snapshot = null;
  let commandCounter = 0;
  let heartbeat = null;
  let knownEntities = null;
  let suspectCommit = null;
  const invalidation = createInvalidationTimer({ platform, onFire: () => invalidateAll() });

  function changed() {
    version += 1;
    snapshot = null;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (_error) {
        // A card's render failure must not stop the session or the other cards.
      }
    }
  }

  function setPhase(next, failure = null) {
    if (phase === next && phaseFailure?.code === failure?.code) return;
    phase = next;
    phaseFailure = failure;
    changed();
  }

  function demandedKeys() {
    const keys = new Set();
    for (const set of demands.values()) for (const key of set) keys.add(key);
    return keys;
  }

  function entry(key, name, params) {
    if (!scopes.has(key)) scopes.set(key, { key, name, params, hints: {}, status: "idle", stale: false, data: null, error: null, loadedAt: null, reload: false });
    return scopes.get(key);
  }

  async function load(scope) {
    if (scope.status === "loading") {
      scope.reload = true;
      return;
    }
    scope.status = "loading";
    scope.reload = false;
    changed();
    const result = await SCOPE_LOADERS[scope.name](transport, { ...scope.hints, ...scope.params });
    if (disposed) return;
    if (result.ok) {
      scope.status = "ready";
      scope.data = result.data;
      scope.error = null;
      scope.stale = false;
      scope.loadedAt = platform?.now?.() ?? null;
    } else {
      scope.status = "error";
      scope.error = result;
      handleFailure(result);
    }
    changed();
    if (scope.reload && demandedKeys().has(scope.key)) await load(scope);
  }

  // A scope failure can reveal a phase: the integration unloaded, or became incompatible.
  function handleFailure(failure) {
    if (LOAD_FAILED_CODES.has(failure.code)) setPhase("load_failed", failure);
    else if (failure.code === "api_incompatible") setPhase("api_incompatible", failure);
    else if (failure.code === "unknown_command") void probe();
  }

  function refreshDemanded({ onlyStale = true } = {}) {
    if (phase !== "ready") return;
    for (const key of demandedKeys()) {
      const scope = scopes.get(key);
      if (!scope) continue;
      if (!onlyStale || scope.status === "idle" || scope.stale || scope.status === "error") void load(scope);
    }
  }

  function invalidateAll() {
    for (const scope of scopes.values()) if (scope.status !== "idle" && !HOME_ASSISTANT_SCOPES.has(scope.name)) scope.stale = true;
    changed();
    refreshDemanded();
  }

  function invalidate(names) {
    const wanted = names === "all" ? null : new Set(names);
    for (const scope of scopes.values()) if (!wanted || wanted.has(scope.name)) scope.stale = scope.status !== "idle";
    changed();
    refreshDemanded();
  }

  function onEvent(event) {
    if (disposed || !guards.event(event)) return;
    live = Object.freeze({ mode: event.mode, pendingJobs: event.pending_jobs, needsAttention: event.needs_attention === true, queueRevision: event.queue_revision });
    if (runtime.id !== null && event.runtime_id !== runtime.id) {
      runtime = { id: event.runtime_id, sequence: event.runtime_sequence, commitId: event.commit_id };
      invalidation.cancel();
      invalidateAll();
      return;
    }
    if (runtime.sequence !== null && event.runtime_sequence <= runtime.sequence) return;
    runtime = { id: event.runtime_id, sequence: event.runtime_sequence, commitId: event.commit_id };
    changed();
    invalidation.schedule();
  }

  async function subscribe() {
    if (unsubscribe || subscription === "connecting") return true;
    subscription = "connecting";
    const result = await transport.subscribe(messages.subscribe(), onEvent);
    if (disposed) {
      if (result.ok && typeof result.data === "function") result.data();
      return false;
    }
    if (!result.ok) {
      subscription = "failed";
      return result;
    }
    unsubscribe = typeof result.data === "function" ? result.data : null;
    subscription = "live";
    return true;
  }

  async function runProbe({ resubscribe = false } = {}) {
    const hass = getHass();
    if (resubscribe || phase !== "ready") dropSubscription();
    if (!componentLoaded(hass)) {
      const manifest = await SCOPE_LOADERS.manifest(transport);
      if (disposed) return;
      Object.assign(entry(scopeKey("manifest"), "manifest", {}), manifest.ok ? { status: "ready", data: manifest.data, error: null } : { status: "error", data: null, error: manifest });
      if (manifest.ok) setPhase("not_set_up");
      else if (manifest.code === "not_found") setPhase("not_installed");
      else setPhase("offline", manifest);
      return;
    }
    const subscribed = await subscribe();
    if (disposed) return;
    if (isBackendFailure(subscribed)) {
      if (LOAD_FAILED_CODES.has(subscribed.code)) setPhase("load_failed", subscribed);
      else if (subscribed.code === "unknown_command") setPhase("not_set_up", subscribed);
      else setPhase("offline", subscribed);
      return;
    }
    const check = await SCOPE_LOADERS.queue(transport, { offset: 0, limit: 1 });
    if (disposed) return;
    if (!check.ok) {
      if (LOAD_FAILED_CODES.has(check.code)) setPhase("load_failed", check);
      else if (check.code === "api_incompatible" || check.code === "invalid_response") setPhase("api_incompatible", check);
      else setPhase("offline", check);
      return;
    }
    apiVersion = check.data.apiVersion;
    runtime = { ...runtime, commitId: check.data.commitId };
    suspectCommit = null;
    setPhase("ready");
    const manifestScope = entry(scopeKey("manifest"), "manifest", {});
    if (manifestScope.status === "idle") void load(manifestScope);
    invalidateAll();
  }

  function probe(options) {
    if (disposed) return Promise.resolve();
    if (!probing) {
      probing = runProbe(options).finally(() => {
        probing = null;
        scheduleHeartbeat();
      });
    }
    return probing;
  }

  // The integration binds a subscription to the runtime that served it; a reloaded config entry
  // ends it silently. A commit the subscription did not report on two consecutive beats means
  // the subscription is gone. Outside `ready`, the beat retries the probe.
  async function beat() {
    heartbeat = null;
    if (disposed) return;
    if (!platform?.isDocumentHidden?.()) {
      if (phase === "ready") {
        const check = await SCOPE_LOADERS.queue(transport, { offset: 0, limit: 1 });
        if (disposed) return;
        if (!check.ok) handleFailure(check);
        else if (runtime.commitId !== null && check.data.commitId > runtime.commitId) {
          if (suspectCommit !== null && check.data.commitId >= suspectCommit) await probe({ resubscribe: true });
          else suspectCommit = check.data.commitId;
        } else suspectCommit = null;
      } else if (phase !== "probing") {
        await probe();
      }
    }
    scheduleHeartbeat();
  }

  function scheduleHeartbeat() {
    if (disposed || heartbeat !== null || typeof platform?.setTimeout !== "function") return;
    heartbeat = platform.setTimeout(() => void beat(), HEARTBEAT_MS);
  }

  function dropSubscription() {
    const current = unsubscribe;
    unsubscribe = null;
    subscription = "idle";
    if (typeof current === "function") {
      try {
        current();
      } catch (_error) {
        // A handle from a closed connection cannot be released twice; nothing is left to do.
      }
    }
  }

  // The connection library re-subscribes by itself; after a reconnect the snapshot is reloaded.
  cleanups.push(transport.onConnection("ready", () => {
    if (subscription === "reconnecting") subscription = "live";
    void probe();
  }));
  cleanups.push(transport.onConnection("disconnected", () => {
    if (subscription === "live") subscription = "reconnecting";
    changed();
  }));

  // Home Assistant hands every card a new hass object on each state change; only the loaded
  // integration set can change the phase.
  function syncHass() {
    const hass = getHass();
    const entities = hass?.entities ?? null;
    if (entities !== knownEntities) {
      knownEntities = entities;
      invalidate(ENTITY_REGISTRY_SCOPES);
    }
    const loaded = componentLoaded(hass);
    if (wasLoaded === loaded) return;
    wasLoaded = loaded;
    void probe();
  }

  function setDemand(owner, requests = []) {
    const keys = new Set();
    // `hints` steer a loader without naming a different scope (an expected count, for example).
    for (const { name, params = {}, hints = null } of requests) {
      if (!SCOPE_LOADERS[name]) continue;
      const key = scopeKey(name, params);
      const scope = entry(key, name, params);
      if (hints) scope.hints = { ...hints };
      keys.add(key);
    }
    const previous = demands.get(owner);
    if (previous && previous.size === keys.size && [...keys].every((key) => previous.has(key))) return;
    demands.set(owner, keys);
    refreshDemanded();
  }

  function releaseDemand(owner) {
    demands.delete(owner);
  }

  function reload(name, params = {}) {
    const scope = scopes.get(scopeKey(name, params));
    if (scope) void load(scope);
  }

  // `invalidates`: scope names reloaded after a confirmed command; the subscription event that
  // follows every commit is coalesced into the same reload.
  async function command(operation, parameters = {}, { target = operation, invalidates = "all" } = {}) {
    const commandId = `voc-${++commandCounter}`;
    if (disposed) return backendFailure("connection_lost", { detail: "disposed" });
    if (phase !== "ready") return backendFailure("orchestrator_not_loaded", { detail: phase });
    if (!registeredOperations(getHass()).has(operation)) return backendFailure("operation_missing", { detail: operation });
    if (pending.has(target)) return backendFailure("command_pending", { detail: target });
    pending.set(target, { operation, commandId });
    changed();
    let result;
    if (ACTIONS[operation]) {
      result = await transport.service(operation, parameters, { returnResponse: ACTIONS[operation].response });
    } else if (CONFIGURATION_COMMANDS.includes(operation)) {
      result = await transport.ws(messages.command(operation, parameters));
      if (result.ok && !guards.commandResult(result.data)) result = backendFailure("invalid_response", { detail: operation });
    } else {
      result = backendFailure("operation_missing", { detail: operation });
    }
    pending.delete(target);
    if (disposed) return result;
    if (result.ok) invalidate(invalidates);
    else {
      handleFailure(result);
      changed();
    }
    return result.ok ? Object.freeze({ ok: true, commandId, data: result.data ?? null }) : result;
  }

  function getSnapshot() {
    if (snapshot) return snapshot;
    const scopeState = {};
    for (const scope of scopes.values()) {
      scopeState[scope.key] = { name: scope.name, params: scope.params, status: scope.status, stale: scope.stale, data: scope.data, error: scope.error, loadedAt: scope.loadedAt };
    }
    snapshot = freeze({
      version,
      phase,
      phaseFailure,
      apiVersion,
      runtime: { ...runtime },
      live,
      subscription,
      scopes: scopeState,
      pending: Object.fromEntries([...pending].map(([target, value]) => [target, value.operation])),
    });
    return snapshot;
  }

  return Object.freeze({
    probe,
    syncHass,
    setDemand,
    releaseDemand,
    reload,
    command,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidation.cancel();
      if (heartbeat !== null) platform?.clearTimeout?.(heartbeat);
      heartbeat = null;
      dropSubscription();
      for (const cleanup of cleanups.splice(0)) cleanup();
      transport.dispose?.();
      listeners.clear();
    },
  });
}
