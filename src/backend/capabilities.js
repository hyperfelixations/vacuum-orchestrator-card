// What the connected backend can actually do. Capability names are protocol identifiers and
// never user-facing text; the presentation layer words them through `capability.*` keys.
// Negotiation contract: see internal dev doc §6 "Capability-Verhandlung".

export const CAPABILITY = Object.freeze({
  QUEUE_READ: "queueRead",
  JOB_READ: "jobRead",
  JOBS_HISTORY: "jobsHistory",
  LIVE_SUBSCRIBE: "liveSubscribe",
  JOB_CREATE: "jobCreate",
  JOB_UPDATE: "jobUpdate",
  JOB_DELETE: "jobDelete",
  JOB_MOVE: "jobMove",
  JOB_START: "jobStart",
  JOB_CANCEL: "jobCancel",
  JOB_RETRY: "jobRetry",
  QUEUE_RUN: "queueRun",
  QUEUE_PAUSE: "queuePause",
  QUEUE_RESUME: "queueResume",
  JOBS_ACTIVE: "jobsActive",
  ROBOTS_READ: "robotsRead",
  AREAS_READ: "areasRead",
  JOB_PROGRESS: "jobProgress",
  JOB_BLOCKED_REASON: "jobBlockedReason",
  RECOVERY_RESOLVE: "recoveryResolve",
  DESCRIBE: "describe",
});

export const CAPABILITY_KEYS = Object.freeze(Object.values(CAPABILITY));

// Queries an API version is known to answer. Commands are not listed here: their presence is
// read from `hass.services` instead, which needs no round trip.
export const CAPABILITIES_BY_API_VERSION = Object.freeze({
  2: Object.freeze([
    CAPABILITY.QUEUE_READ,
    CAPABILITY.JOB_READ,
    CAPABILITY.JOBS_HISTORY,
    CAPABILITY.LIVE_SUBSCRIBE,
  ]),
});

const SERVICE_CAPABILITIES = Object.freeze({
  create_job: CAPABILITY.JOB_CREATE,
  update_job: CAPABILITY.JOB_UPDATE,
  delete_job: CAPABILITY.JOB_DELETE,
  move_job: CAPABILITY.JOB_MOVE,
  start_job: CAPABILITY.JOB_START,
  cancel_job: CAPABILITY.JOB_CANCEL,
  retry_job: CAPABILITY.JOB_RETRY,
  run_queue: CAPABILITY.QUEUE_RUN,
  pause_queue: CAPABILITY.QUEUE_PAUSE,
  resume_queue: CAPABILITY.QUEUE_RESUME,
});

export const NO_CAPABILITIES = Object.freeze({
  values: Object.freeze(Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false]))),
  negotiated: false,
  source: null,
  apiVersion: null,
  integrationVersion: null,
  limits: null,
});

function serviceNames(services) {
  if (!services || typeof services !== "object") return new Set();
  return new Set(Object.keys(services));
}

function valuesFrom(keys) {
  const values = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false]));
  for (const key of keys) if (key in values) values[key] = true;
  return values;
}

// `describe` is authoritative where the backend offers it; otherwise the API version supplies
// the query set and `hass.services` the command set. Probe results always win last, because
// they are evidence from a real call.
export function capabilitiesFrom({ apiVersion = null, describe = null, services = null, probes = null } = {}) {
  const declared = describe && Array.isArray(describe.capabilities);
  const keys = new Set(
    declared ? describe.capabilities.filter((key) => typeof key === "string") : CAPABILITIES_BY_API_VERSION[apiVersion] || []
  );
  if (declared) keys.add(CAPABILITY.DESCRIBE);
  const available = serviceNames(services);
  for (const [service, capability] of Object.entries(SERVICE_CAPABILITIES)) {
    if (available.has(service)) keys.add(capability);
    else keys.delete(capability);
  }
  for (const [key, supported] of Object.entries(probes || {})) {
    if (supported) keys.add(key);
    else keys.delete(key);
  }
  return Object.freeze({
    values: Object.freeze(valuesFrom(keys)),
    negotiated: true,
    source: declared ? "describe" : "legacy",
    apiVersion: apiVersion ?? null,
    integrationVersion: declared ? describe.integration_version ?? null : null,
    limits: declared && describe.limits && typeof describe.limits === "object" ? Object.freeze({ ...describe.limits }) : null,
  });
}

export function missingCapabilities(values) {
  return CAPABILITY_KEYS.filter((key) => values?.[key] !== true);
}

// Which backend capability a section needs. Diagnostics needs none: it is the section that
// explains a backend the card cannot reach.
export function capabilityForSection(key) {
  return {
    queue: CAPABILITY.QUEUE_READ,
    history: CAPABILITY.JOBS_HISTORY,
    rooms: CAPABILITY.AREAS_READ,
    robots: CAPABILITY.ROBOTS_READ,
  }[key] || null;
}
