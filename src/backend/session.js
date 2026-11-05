// One backend session per Home Assistant connection, shared by every card on it. It finds out
// whether the integration is installed, set up and compatible, keeps one subscription that
// follows the integration across reloads, loads exactly the scopes some card currently shows,
// and sends commands one per target.
// It holds no domain rule. See internal dev doc §6 "Sitzung".

import { parseInstant } from "../core/time.js";
import { backendFailure, isBackendFailure, isTransportFailure } from "../domain/backend-errors.js";
import { normalizeValidation } from "../domain/validation.js";
import { ACTIONS, CARD_COMMANDS, CONFIGURATION_COMMANDS, guards, messages } from "./protocol.js";
import { SCOPE_LOADERS, scopesForChanges } from "./scopes.js";
import { createInvalidationTimer } from "./subscription.js";
import { releaseSubscription } from "./transport.js";

export const DOMAIN = "vacuum_orchestrator";

// Phases of the connection to the integration, in the order a fresh install passes them.
export const PHASES = Object.freeze(["probing", "not_installed", "not_set_up", "load_failed", "api_incompatible", "check_failed", "offline", "ready"]);

// Outside `ready`, a visible card probes again this often; `ready` reads nothing periodically.
export const RETRY_MS = 30_000;
// How long an unloaded integration may take to load again before the card shows a load failure.
export const UNLOADED_GRACE_MS = 5_000;

// Home Assistant's own data and the robot discovery derived from its entity registry; the
// integration's invalidation events do not concern them.
const HOME_ASSISTANT_SCOPES = new Set(["registry", "manifest", "candidates", "errorTexts"]);
// Served by Home Assistant from the integration's files: needed to word why it is not ready.
const ANY_PHASE_SCOPES = new Set(["errorTexts"]);
const ENTITY_REGISTRY_SCOPES = Object.freeze(["registry", "candidates"]);
// Keyed by an editor draft: a key nobody asks for any more is never asked for again.
const DRAFT_SCOPES = new Set(["preview"]);
// Scopes nobody demands stay for a quick return, this many of them, the most recently shown.
export const PRUNE_KEEP = 32;

const LOAD_FAILED_CODES = new Set(["orchestrator_not_loaded", "orchestrator_not_initialized", "orchestrator_shutting_down", "multiple_orchestrator_entries_loaded"]);

// The phase a failed probe step leaves, given the codes that step reads as a phase of its own.
function failurePhase(failure, own = {}) {
  if (Object.hasOwn(own, failure.code)) return own[failure.code];
  if (LOAD_FAILED_CODES.has(failure.code)) return "load_failed";
  return isTransportFailure(failure) ? "offline" : "check_failed";
}

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

// The queue's mode and counts as an event or a queue read reports them, and the point of this
// runtime they were read at.
function liveOfEvent(event) {
  const count = (value) => (Number.isInteger(value) ? value : null);
  return { runtimeId: event.runtime_id, sequence: event.runtime_sequence, mode: event.mode, pendingJobs: event.pending_jobs, needsAttention: event.needs_attention === true, queueRevision: event.queue_revision, activeCount: count(event.active_count), attentionCount: count(event.attention_count) };
}

function liveOfQueue(queue, view) {
  return { runtimeId: view.runtimeId, sequence: view.sequence, mode: queue.mode, pendingJobs: queue.total, needsAttention: queue.needsAttention, queueRevision: queue.queueRevision, activeCount: queue.activeCount, attentionCount: queue.attentionCount };
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
  // The newest queue facts of this runtime, from the probe, a queue read or an event.
  let live = null;
  let subscription = "idle";
  // Callbacks of a subscription the session gave up carry an older generation and are ignored.
  let generation = 0;
  // Stamps when a scope stopped being demanded, to prune the longest unused first.
  let releases = 0;
  let unsubscribe = null;
  let probing = null;
  let wasLoaded = null;
  let disposed = false;
  let version = 0;
  let snapshot = null;
  let commandCounter = 0;
  let retry = null;
  let unloadedProbe = null;
  let knownEntities = null;
  // The integration's clock at a moment of the platform's monotonic clock; null before any answer.
  let anchor = null;
  const invalidation = createInvalidationTimer({ platform, onFire: (change) => invalidateChanged(change) });

  const monotonic = () => (typeof platform?.monotonicNow === "function" ? platform.monotonicNow() : platform?.now?.() ?? 0);

  function anchorAt(serverTime) {
    if (Number.isFinite(serverTime)) anchor = { serverMs: serverTime, at: monotonic() };
  }

  // The integration's clock now, carried forward from its last answer; the platform's clock
  // until the integration answered.
  function now() {
    if (!anchor) return platform?.now?.() ?? 0;
    return anchor.serverMs + (monotonic() - anchor.at);
  }

  function offerLive(next) {
    if (live && live.runtimeId === next.runtimeId && next.sequence < live.sequence) return;
    live = Object.freeze(next);
  }

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
    if (!scopes.has(key)) scopes.set(key, { key, name, params, status: "idle", stale: false, data: null, view: null, requested: null, error: null, loadedAt: null, reload: false, releasedAt: 0 });
    return scopes.get(key);
  }

  async function load(scope) {
    if (scope.status === "loading") {
      scope.reload = true;
      return;
    }
    scope.status = "loading";
    scope.reload = false;
    scope.stale = false;
    // The integration answers in order: a read sent now shows at least what the session has seen.
    scope.requested = { runtimeId: runtime.id, sequence: runtime.sequence, commitId: runtime.commitId };
    changed();
    const result = await SCOPE_LOADERS[scope.name](transport, scope.params);
    if (disposed) return;
    if (result.ok) {
      scope.status = "ready";
      scope.data = result.data;
      scope.view = result.view ?? null;
      anchorAt(scope.view?.serverTime);
      scope.error = null;
      scope.stale = false;
      scope.loadedAt = platform?.now?.() ?? null;
      if (scope.name === "queue" && scope.view?.runtimeId === runtime.id) offerLive(liveOfQueue(scope.data, scope.view));
    } else {
      scope.status = "error";
      scope.error = result;
      handleFailure(result);
    }
    // Outdated while it was read: read again for a card, else stale until one shows it.
    const again = scope.reload && demandedKeys().has(scope.key);
    if (scope.reload && !again) scope.stale = true;
    prune();
    changed();
    if (again) await load(scope);
  }

  // A scope failure can reveal a phase: the integration unloaded, or became incompatible.
  function handleFailure(failure) {
    if (LOAD_FAILED_CODES.has(failure.code)) setPhase("load_failed", failure);
    else if (failure.code === "api_incompatible") setPhase("api_incompatible", failure);
    else if (failure.code === "unknown_command") void probe();
  }

  function refreshDemanded({ onlyStale = true } = {}) {
    for (const key of demandedKeys()) {
      const scope = scopes.get(key);
      if (!scope || (phase !== "ready" && !ANY_PHASE_SCOPES.has(scope.name))) continue;
      if (!onlyStale || scope.status === "idle" || scope.stale || scope.status === "error") void load(scope);
    }
  }

  // A scope that no longer shows the integration. One being read is read again afterwards: its
  // read was sent before the change.
  function outdate(scope) {
    scope.stale = true;
    if (scope.status === "loading") scope.reload = true;
  }

  function invalidateAll() {
    for (const scope of scopes.values()) if (scope.status !== "idle" && !HOME_ASSISTANT_SCOPES.has(scope.name)) outdate(scope);
    changed();
    refreshDemanded();
  }

  // A scope read, or being read, in this runtime at or after the given point already shows what
  // changed.
  function shows(scope, { sequence = null, commitId = null }) {
    const view = scope.status === "loading" ? scope.requested : scope.view;
    if (!view || view.runtimeId !== runtime.id) return false;
    if (Number.isInteger(sequence)) return view.sequence >= sequence;
    return Number.isInteger(commitId) && view.commitId >= commitId;
  }

  // After the events of a burst: the scopes they named that do not show the newest of them.
  function invalidateChanged({ scopes: names, sequence }) {
    for (const scope of scopes.values()) {
      if (scope.status === "idle" || HOME_ASSISTANT_SCOPES.has(scope.name)) continue;
      if (names !== "all" && !names.has(scope.name)) continue;
      if (!shows(scope, { sequence })) outdate(scope);
    }
    changed();
    refreshDemanded();
  }

  // `commitId`: a confirmed commit; scopes read at or after it are already current.
  function invalidate(names, { commitId = null } = {}) {
    const wanted = names === "all" ? null : new Set(names);
    for (const scope of scopes.values()) {
      if (wanted && !wanted.has(scope.name)) continue;
      if (!shows(scope, { commitId }) && scope.status !== "idle") outdate(scope);
    }
    changed();
    refreshDemanded();
  }

  function cancelUnloadedProbe() {
    if (unloadedProbe !== null) platform?.clearTimeout?.(unloadedProbe);
    unloadedProbe = null;
  }

  // The integration unloaded its runtime: wait briefly for a reload before calling it a failure.
  function onUnloaded() {
    live = null;
    if (phase !== "ready") {
      changed();
      return;
    }
    invalidation.cancel();
    setPhase("probing");
    if (unloadedProbe === null && typeof platform?.setTimeout === "function") {
      unloadedProbe = platform.setTimeout(() => {
        unloadedProbe = null;
        void probe();
      }, UNLOADED_GRACE_MS);
    }
  }

  // Everything about an event is decided before the session changes: an event it has already
  // seen moves neither the clock nor the live values.
  function onEvent(event) {
    if (disposed) return;
    if (guards.unloadedEvent(event)) {
      onUnloaded();
      return;
    }
    if (!guards.event(event)) return;
    // An incompatible integration changes only with an update, which restarts Home Assistant.
    if (phase === "api_incompatible") return;
    // Outside ready the probe reads the integration as it is now.
    if (phase !== "ready") {
      cancelUnloadedProbe();
      void probe();
      return;
    }
    const newRuntime = runtime.id !== null && event.runtime_id !== runtime.id;
    if (!newRuntime && runtime.sequence !== null && event.runtime_sequence <= runtime.sequence) return;
    anchorAt(parseInstant(event.server_time));
    offerLive(liveOfEvent(event));
    runtime = { id: event.runtime_id, sequence: event.runtime_sequence, commitId: event.commit_id };
    if (newRuntime) {
      invalidation.cancel();
      invalidateAll();
      return;
    }
    changed();
    invalidation.schedule({ scopes: scopesForChanges(event.changed), sequence: event.runtime_sequence });
  }

  async function subscribe() {
    if (unsubscribe || subscription === "connecting") return true;
    subscription = "connecting";
    const own = ++generation;
    const result = await transport.subscribe(messages.subscribe(), (event) => {
      if (own === generation) onEvent(event);
    });
    if (disposed) {
      if (result.ok) releaseSubscription(result.data);
      return false;
    }
    if (!result.ok) {
      generation += 1;
      subscription = "failed";
      return result;
    }
    unsubscribe = typeof result.data === "function" ? result.data : null;
    subscription = "live";
    return true;
  }

  async function runProbe() {
    const hass = getHass();
    if (!componentLoaded(hass)) {
      dropSubscription();
      const manifest = await SCOPE_LOADERS.manifest(transport);
      if (disposed) return;
      Object.assign(entry(scopeKey("manifest"), "manifest", {}), manifest.ok ? { status: "ready", data: manifest.data, error: null } : { status: "error", data: null, error: manifest });
      if (manifest.ok) setPhase("not_set_up");
      else setPhase(failurePhase(manifest, { not_found: "not_installed" }), manifest);
      return;
    }
    const subscribed = await subscribe();
    if (disposed) return;
    if (isBackendFailure(subscribed)) {
      setPhase(failurePhase(subscribed, { unknown_command: "not_set_up" }), subscribed);
      return;
    }
    const check = await SCOPE_LOADERS.queue(transport, { offset: 0, limit: 1 });
    if (disposed) return;
    if (!check.ok) {
      setPhase(failurePhase(check, { api_incompatible: "api_incompatible", invalid_response: "api_incompatible" }), check);
      return;
    }
    apiVersion = check.data.apiVersion;
    anchorAt(check.data.serverTime);
    runtime = { id: check.data.runtimeId, sequence: check.data.runtimeSequence, commitId: check.data.commitId };
    if (check.view) offerLive(liveOfQueue(check.data, check.view));
    cancelUnloadedProbe();
    setPhase("ready");
    invalidateAll();
  }

  function probe() {
    if (disposed) return Promise.resolve();
    if (!probing) {
      probing = runProbe().finally(() => {
        probing = null;
        scheduleRetry();
      });
    }
    return probing;
  }

  // The subscription reports reloads; only a card that is not ready retries on its own, for
  // what no event announces (a lost connection, a late install).
  function scheduleRetry() {
    if (disposed || retry !== null || phase === "ready" || phase === "probing" || typeof platform?.setTimeout !== "function") return;
    retry = platform.setTimeout(() => {
      retry = null;
      if (disposed || phase === "ready") return;
      if (platform?.isDocumentHidden?.()) scheduleRetry();
      else void probe();
    }, RETRY_MS);
  }

  function dropSubscription() {
    const current = unsubscribe;
    unsubscribe = null;
    subscription = "idle";
    generation += 1;
    releaseSubscription(current);
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

  // What nobody demands: a draft's scope goes at once, the others stay for a quick return, the
  // PRUNE_KEEP most recently demanded. A scope being read stays until its read ends. No card shows
  // a scope nobody demands, so pruning tells no card.
  function prune() {
    const demanded = demandedKeys();
    const kept = [];
    for (const [key, scope] of scopes) {
      if (demanded.has(key) || scope.status === "loading" || HOME_ASSISTANT_SCOPES.has(scope.name)) continue;
      if (DRAFT_SCOPES.has(scope.name)) scopes.delete(key);
      else kept.push(scope);
    }
    kept.sort((one, other) => other.releasedAt - one.releasedAt);
    for (const scope of kept.slice(PRUNE_KEEP)) scopes.delete(scope.key);
    snapshot = null;
  }

  // Sets or ends one owner's demand, stamps the scopes nobody demands any more and prunes.
  function demand(owner, keys) {
    const before = demandedKeys();
    if (keys) demands.set(owner, keys);
    else demands.delete(owner);
    const after = demandedKeys();
    releases += 1;
    for (const key of before) if (!after.has(key) && scopes.has(key)) scopes.get(key).releasedAt = releases;
    prune();
  }

  function setDemand(owner, requests = []) {
    const keys = new Set();
    for (const { name, params = {} } of requests) {
      if (!SCOPE_LOADERS[name]) continue;
      const key = scopeKey(name, params);
      entry(key, name, params);
      keys.add(key);
    }
    const previous = demands.get(owner);
    if (previous && previous.size === keys.size && [...keys].every((key) => previous.has(key))) return;
    demand(owner, keys);
    refreshDemanded();
  }

  function releaseDemand(owner) {
    if (demands.has(owner)) demand(owner, null);
  }

  function reload(name, params = {}) {
    const scope = scopes.get(scopeKey(name, params));
    if (scope) void load(scope);
  }

  // The integration's verdict on a form's input for `operation`, without effect (`validate`).
  async function validate(operation, data = {}) {
    if (disposed) return backendFailure("connection_lost", { detail: "disposed" });
    if (phase !== "ready") return backendFailure("orchestrator_not_loaded", { detail: phase });
    const result = await transport.ws(messages.query("validate", { command: operation, data }));
    if (!result.ok) return result;
    const verdict = guards.validation(result.data) ? normalizeValidation(result.data) : null;
    return verdict ? Object.freeze({ ok: true, data: verdict }) : backendFailure("invalid_response", { detail: "validate" });
  }

  // `invalidates`: scope names reloaded after a confirmed command, unless already read at its
  // commit; the subscription event of the same commit then finds them current. Without an
  // answer the command may have taken effect, so they are reloaded as well (UI-17).
  async function command(operation, parameters = {}, { target = operation, invalidates = "all" } = {}) {
    const commandId = `voc-${++commandCounter}`;
    if (disposed) return backendFailure("connection_lost", { detail: "disposed" });
    if (phase !== "ready") return backendFailure("orchestrator_not_loaded", { detail: phase });
    // Card commands are no actions: a loaded integration always offers them.
    if (!CARD_COMMANDS.includes(operation) && !registeredOperations(getHass()).has(operation)) return backendFailure("operation_missing", { detail: operation });
    if (pending.has(target)) return backendFailure("command_pending", { detail: target });
    pending.set(target, { operation, commandId });
    changed();
    let result;
    if (ACTIONS.includes(operation)) {
      result = await transport.service(operation, parameters, { returnResponse: true });
    } else if (CONFIGURATION_COMMANDS.includes(operation) || CARD_COMMANDS.includes(operation)) {
      result = await transport.ws(messages.command(operation, parameters));
      if (result.ok && !guards.commandResult(result.data)) result = backendFailure("invalid_response", { detail: operation });
    } else {
      result = backendFailure("operation_missing", { detail: operation });
    }
    pending.delete(target);
    if (disposed) return result;
    if (result.ok) invalidate(invalidates, { commitId: result.data?.commit_id ?? null });
    else if (isTransportFailure(result)) invalidate(invalidates);
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
      scopeState[scope.key] = { name: scope.name, params: scope.params, status: scope.status, stale: scope.stale, data: scope.data, view: scope.view, error: scope.error, loadedAt: scope.loadedAt };
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
    validate,
    command,
    getSnapshot,
    now,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidation.cancel();
      cancelUnloadedProbe();
      if (retry !== null) platform?.clearTimeout?.(retry);
      retry = null;
      dropSubscription();
      for (const cleanup of cleanups.splice(0)) cleanup();
      transport.dispose?.();
      listeners.clear();
    },
  });
}
