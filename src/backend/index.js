// The card's only door to Vacuum Orchestrator. It negotiates what the installed backend can
// do, keeps one volatile snapshot in sync, and turns every mutation into one confirmed
// command. Nothing above this module talks to Home Assistant about the integration.
// Contract: see internal dev doc §6.

import { isBackendError } from "../domain/backend-errors.js";
import { isMoveDirection } from "../domain/job-schema.js";
import { ACTIONS, SUPPORTED_API_VERSIONS, describeMessage, queueGetMessage } from "./protocol.js";
import { CAPABILITY, capabilitiesFrom } from "./capabilities.js";
import { createClient } from "./client.js";
import { createSubscription } from "./subscription.js";
import { createStore } from "./store.js";
import { findEntityStatus } from "./entity-status.js";

const DOMAIN = "vacuum_orchestrator";

// Home Assistant reports loaded integrations as a list. Duck-typed rather than `instanceof`,
// because a card can be adopted into another realm where the constructors differ.
function componentLoaded(hass) {
  const components = hass?.config?.components;
  if (!components) return false;
  if (typeof components.has === "function") return components.has(DOMAIN);
  if (typeof components.includes === "function") return components.includes(DOMAIN);
  if (typeof components === "object") return Boolean(components[DOMAIN]);
  return false;
}

function servicesOf(hass) {
  return hass?.services?.[DOMAIN] || null;
}

function refusal(commandId, code, group, detail = null) {
  return Object.freeze({ ok: false, commandId, code, group, detail });
}

export function createOrchestratorBackend({ getHass, platform, onChange, clock, pageSize } = {}) {
  const hassNow = () => getHass?.() ?? null;
  const client = createClient({ getHass: hassNow, platform });
  const store = createStore({ client, clock: clock || platform, onChange, pageSize });
  let subscription = null;
  let disposed = false;
  let negotiating = null;
  let commandCounter = 0;

  store.setEntityStatus(findEntityStatus(hassNow()));

  function startSubscription() {
    if (subscription || disposed) return;
    subscription = createSubscription({
      getHass: hassNow,
      platform,
      onEvent: (event) => {
        store.recordEvent(event);
        void store.refresh("queue");
      },
      onStateChange: (change) => {
        store.setSubscriptionState(change);
        if (change?.state === "snapshot_required") void store.refresh("all");
      },
    });
  }

  // Three steps, none of which needs a backend change: is the component there, does it answer
  // `describe`, and if not, what does a one-row queue page report as its API version.
  async function negotiate() {
    if (disposed) return false;
    if (!componentLoaded(hassNow())) {
      store.setConnection({ state: "backend_missing", lastError: null });
      return false;
    }
    store.setConnection({ state: "connecting" });
    let describe = null;
    let apiVersion = null;
    const descriptor = await client.query(describeMessage());
    if (!isBackendError(descriptor)) {
      describe = descriptor;
      apiVersion = descriptor.api_version;
    } else {
      const probe = await client.query(queueGetMessage({ offset: 0, limit: 1 }));
      if (isBackendError(probe)) {
        // A version this card cannot read fails its response guard; everything else is a
        // transport or load problem.
        const state = probe.code === "invalid_response" ? "api_incompatible" : probe.code === "orchestrator_not_loaded" ? "backend_not_loaded" : "disconnected";
        store.setConnection({ state, lastError: { scope: "probe", code: probe.code, group: probe.group, detail: probe.detail } });
        return false;
      }
      apiVersion = probe.api_version;
    }
    if (!SUPPORTED_API_VERSIONS.includes(apiVersion)) {
      store.setCapabilities(capabilitiesFrom({ apiVersion, describe, services: servicesOf(hassNow()) }));
      store.setConnection({ state: "api_incompatible", apiVersion });
      return false;
    }
    store.setCapabilities(capabilitiesFrom({ apiVersion, describe, services: servicesOf(hassNow()) }));
    store.setConnection({ state: "connected" });
    if (store.hasCapability(CAPABILITY.LIVE_SUBSCRIBE)) startSubscription();
    await store.refresh("all");
    return true;
  }

  function connect() {
    if (disposed || negotiating) return negotiating || Promise.resolve(false);
    negotiating = negotiate().finally(() => {
      negotiating = null;
    });
    return negotiating;
  }

  // Home Assistant hands over a new hass object on every state change. Only the cheap,
  // push-based parts are refreshed here; queries stay event-driven.
  function syncHass() {
    if (disposed) return;
    store.setEntityStatus(findEntityStatus(hassNow()));
    const state = store.getState().connection.state;
    if (state === "backend_missing" && componentLoaded(hassNow())) void connect();
  }

  function canRun(capability) {
    const hass = hassNow();
    if (hass?.user && hass.user.is_admin === false) return "read_only";
    if (!store.hasCapability(capability)) return "capability_missing";
    return null;
  }

  function mutate({ capability, action, target, data, refreshScopes = "all" }) {
    const commandId = `voc-refused-${++commandCounter}`;
    if (disposed) return Promise.resolve(refusal(commandId, "orchestrator_not_loaded", "connection", "backend disposed"));
    const blocked = canRun(capability);
    if (blocked === "read_only") return Promise.resolve(refusal(commandId, "unauthorized", "auth", capability));
    if (blocked === "capability_missing") return Promise.resolve(refusal(commandId, "capability_missing", "client", capability));
    return store.executeCommand({ target, action, data, refreshScopes });
  }

  const jobTarget = (jobId) => `job:${jobId}`;

  return Object.freeze({
    getState: store.getState,
    connect,
    syncHass,
    setPageSize: store.setPageSize,
    refresh: (scope) => store.refresh(scope),
    loadPage: (scope, offset) => store.loadPage(scope, offset),

    createJob: (payload) =>
      mutate({ capability: CAPABILITY.JOB_CREATE, action: ACTIONS.CREATE_JOB, target: "create", data: payload || {}, refreshScopes: ["queue", "history"] }),
    updateJob: (jobId, patch) =>
      mutate({ capability: CAPABILITY.JOB_UPDATE, action: ACTIONS.UPDATE_JOB, target: jobTarget(jobId), data: { job_id: jobId, ...(patch || {}) }, refreshScopes: ["queue", "history"] }),
    deleteJob: (jobId) =>
      mutate({ capability: CAPABILITY.JOB_DELETE, action: ACTIONS.DELETE_JOB, target: jobTarget(jobId), data: { job_id: jobId }, refreshScopes: ["queue", "history"] }),
    moveJob: (jobId, direction) =>
      isMoveDirection(direction)
        ? mutate({ capability: CAPABILITY.JOB_MOVE, action: ACTIONS.MOVE_JOB, target: jobTarget(jobId), data: { job_id: jobId, direction }, refreshScopes: "queue" })
        : Promise.resolve(refusal(`voc-refused-${++commandCounter}`, "invalid_response", "client", "invalid direction")),
    startJob: (jobId, robotId) =>
      mutate({
        capability: CAPABILITY.JOB_START,
        action: ACTIONS.START_JOB,
        target: jobTarget(jobId),
        data: robotId === undefined || robotId === null ? { job_id: jobId } : { job_id: jobId, robot_id: robotId },
        refreshScopes: ["queue", "history", "robots"],
      }),
    cancelJob: (jobId) =>
      mutate({ capability: CAPABILITY.JOB_CANCEL, action: ACTIONS.CANCEL_JOB, target: jobTarget(jobId), data: { job_id: jobId }, refreshScopes: ["queue", "history", "robots"] }),
    retryJob: (jobId) =>
      mutate({ capability: CAPABILITY.JOB_RETRY, action: ACTIONS.RETRY_JOB, target: jobTarget(jobId), data: { job_id: jobId }, refreshScopes: ["queue", "history"] }),
    runQueue: () =>
      mutate({ capability: CAPABILITY.QUEUE_RUN, action: ACTIONS.RUN_QUEUE, target: "queue", data: {}, refreshScopes: ["queue", "history", "robots"] }),
    pauseQueue: () =>
      mutate({ capability: CAPABILITY.QUEUE_PAUSE, action: ACTIONS.PAUSE_QUEUE, target: "queue", data: {}, refreshScopes: "queue" }),
    resumeQueue: () =>
      mutate({ capability: CAPABILITY.QUEUE_RESUME, action: ACTIONS.RESUME_QUEUE, target: "queue", data: {}, refreshScopes: ["queue", "history", "robots"] }),

    dispose() {
      if (disposed) return;
      disposed = true;
      subscription?.dispose();
      client.dispose();
      store.dispose();
    },
  });
}
