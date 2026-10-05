// The Vacuum Orchestrator API V2 surface the card uses: WebSocket message builders, the
// operation catalog and structural response guards. Guards check the envelope a normalizer
// relies on; additional fields always pass. See internal dev doc §6 "Protokoll".

export const SUPPORTED_API_VERSIONS = Object.freeze([2]);

export const WS = Object.freeze({
  QUEUE_GET: "vacuum_orchestrator/queue/get",
  JOB_GET: "vacuum_orchestrator/job/get",
  JOBS_LIST: "vacuum_orchestrator/jobs/list",
  SUBSCRIBE: "vacuum_orchestrator/subscribe",
  CONFIGURATION_GET: "vacuum_orchestrator/configuration/get",
  CONFIGURATION_COMMAND: "vacuum_orchestrator/configuration/command",
  MANIFEST_GET: "manifest/get",
  ENTITY_REGISTRY_LIST: "config/entity_registry/list",
  TRANSLATIONS_GET: "frontend/get_translations",
});

// Job and queue commands travel as Home Assistant actions; `response` marks the ones that
// return a payload (`SupportsResponse.OPTIONAL`). Asking any other action for a response fails.
export const ACTIONS = Object.freeze(["create_job", "update_job", "delete_job", "move_job", "start_job", "cancel_job", "retry_job", "run_queue", "pause_queue", "resume_queue"]);

// Configuration commands and queries share the action schemas and travel over the integration's
// own WebSocket types, which report stable error codes.
export const CONFIGURATION_COMMANDS = Object.freeze([
  "configure_queue",
  "create_room",
  "update_room",
  "remove_room",
  "release_room",
  "revoke_room",
  "add_robot",
  "configure_robot",
  "remove_robot",
  "resolve_recovery",
  "save_template",
  "remove_template",
  "create_job_from_template",
  "reset_template_demand",
]);

export const CONFIGURATION_QUERIES = Object.freeze([
  "get_rooms",
  "get_room",
  "get_robots",
  "get_robot_candidates",
  "get_templates",
  "get_history",
  "get_trace",
  "get_diagnostics",
  "get_job_execution",
]);

// Every operation name the card may use. Their presence as registered actions under
// `hass.services.vacuum_orchestrator` is the integration's own statement of what it offers.
export const OPERATIONS = Object.freeze([...ACTIONS, ...CONFIGURATION_COMMANDS, ...CONFIGURATION_QUERIES, "get_queue", "get_job"]);

export const PAGE_LIMIT = 100;

function page(offset = 0, limit = 50) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT) {
    throw new TypeError("invalid page arguments");
  }
  return { offset, limit };
}

export const messages = Object.freeze({
  queueGet: ({ offset, limit } = {}) => Object.freeze({ type: WS.QUEUE_GET, ...page(offset, limit) }),
  jobGet: (jobId) => {
    if (typeof jobId !== "string" || !jobId) throw new TypeError("job_id is required");
    return Object.freeze({ type: WS.JOB_GET, job_id: jobId });
  },
  // `states`: the integration's job state filter; without it every job.
  jobsList: ({ offset, limit, states } = {}) => {
    if (states === undefined) return Object.freeze({ type: WS.JOBS_LIST, ...page(offset, limit) });
    if (!Array.isArray(states) || !states.length || states.some((state) => typeof state !== "string")) throw new TypeError("invalid job states");
    return Object.freeze({ type: WS.JOBS_LIST, ...page(offset, limit), states: [...states] });
  },
  subscribe: () => Object.freeze({ type: WS.SUBSCRIBE }),
  query: (query, parameters = {}) => {
    if (!CONFIGURATION_QUERIES.includes(query)) throw new TypeError(`unknown query ${query}`);
    return Object.freeze({ type: WS.CONFIGURATION_GET, query, parameters: { ...parameters } });
  },
  command: (command, parameters = {}) => {
    if (!CONFIGURATION_COMMANDS.includes(command)) throw new TypeError(`unknown command ${command}`);
    return Object.freeze({ type: WS.CONFIGURATION_COMMAND, command, parameters: { ...parameters } });
  },
  manifest: () => Object.freeze({ type: WS.MANIFEST_GET, integration: "vacuum_orchestrator" }),
  entityRegistry: () => Object.freeze({ type: WS.ENTITY_REGISTRY_LIST }),
  // The integration's exception texts, as Home Assistant serves them to its own frontend.
  errorTexts: (language) => {
    if (typeof language !== "string" || !language) throw new TypeError("language is required");
    return Object.freeze({ type: WS.TRANSLATIONS_GET, language, category: "exceptions", integration: ["vacuum_orchestrator"] });
  },
});

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;

export function apiVersionOf(value) {
  return isObject(value) && Number.isInteger(value.api_version) ? value.api_version : null;
}

export function isSupportedApiVersion(version) {
  return SUPPORTED_API_VERSIONS.includes(version);
}

function isPage(value, key) {
  return isObject(value) && isCount(value.total) && isCount(value.offset) && Number.isInteger(value.limit) && value.limit >= 1 && Array.isArray(value[key]);
}

export const guards = Object.freeze({
  queuePage: (value) => isPage(value, "jobs") && isCount(value.commit_id) && isCount(value.queue_revision) && typeof value.mode === "string",
  jobsPage: (value) => isPage(value, "jobs"),
  job: (value) => isObject(value) && typeof value.job_id === "string",
  roomsPage: (value) => isPage(value, "rooms"),
  room: (value) => isObject(value) && typeof value.room_id === "string",
  robotsPage: (value) => isPage(value, "robots"),
  candidatesPage: (value) => isPage(value, "candidates"),
  templatesPage: (value) => isPage(value, "templates"),
  runsPage: (value) => isPage(value, "runs"),
  tracePage: (value) => isPage(value, "records"),
  execution: (value) => isObject(value) && typeof value.job_id === "string" && Array.isArray(value.robots) && Array.isArray(value.attempts),
  diagnostics: (value) => isObject(value) && isObject(value.trace_window),
  event: (value) => isObject(value) && value.loaded === true && typeof value.runtime_id === "string" && isCount(value.runtime_sequence) && isCount(value.commit_id),
  unloadedEvent: (value) => isObject(value) && value.loaded === false,
  manifest: (value) => isObject(value) && value.domain === "vacuum_orchestrator",
  entityRegistry: (value) => Array.isArray(value),
  translations: (value) => isObject(value) && isObject(value.resources),
  commandResult: (value) => value === null || isObject(value),
});

export const QUERY_COLLECTIONS = Object.freeze({
  get_rooms: { key: "rooms", guard: guards.roomsPage },
  get_robots: { key: "robots", guard: guards.robotsPage },
  get_robot_candidates: { key: "candidates", guard: guards.candidatesPage },
  get_templates: { key: "templates", guard: guards.templatesPage },
  get_history: { key: "runs", guard: guards.runsPage },
  get_trace: { key: "records", guard: guards.tracePage },
});
