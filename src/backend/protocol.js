import { BackendError } from "../domain/backend-errors.js";

export const SUPPORTED_API_VERSIONS = Object.freeze([2]);

export const WS = Object.freeze({
  QUEUE_GET: "vacuum_orchestrator/queue/get",
  JOB_GET: "vacuum_orchestrator/job/get",
  JOBS_LIST: "vacuum_orchestrator/jobs/list",
  DESCRIBE: "vacuum_orchestrator/describe",
  SUBSCRIBE: "vacuum_orchestrator/subscribe",
  ROBOTS_LIST: "vacuum_orchestrator/robots/list",
  AREAS_STATUS: "vacuum_orchestrator/areas/status",
});

export const ACTIONS = Object.freeze({
  CREATE_JOB: "create_job",
  UPDATE_JOB: "update_job",
  DELETE_JOB: "delete_job",
  MOVE_JOB: "move_job",
  START_JOB: "start_job",
  CANCEL_JOB: "cancel_job",
  RETRY_JOB: "retry_job",
  RUN_QUEUE: "run_queue",
  PAUSE_QUEUE: "pause_queue",
  RESUME_QUEUE: "resume_queue",
});

const JOB_STATES = new Set([
  "queued",
  "dispatching",
  "running",
  "canceling",
  "completed",
  "failed",
  "cancelled",
  "needs_attention",
]);
const MODES = new Set(["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"]);
const LEVELS = new Set(["off", "low", "standard", "medium", "high", "maximum", "auto"]);
const ROUTES = new Set(["standard", "deep", "fast", "auto"]);
const POLICIES = new Set(["best_effort", "strict"]);
const QUEUE_MODES = new Set(["idle", "running", "paused"]);
const READINESS_STATES = new Set(["ready", "blocked", "unknown"]);
const DUE_STATES = new Set(["clean", "vacuum_due", "mop_due", "both_due", "unknown"]);
const AVAILABILITIES = new Set(["available", "busy", "unavailable", "unknown"]);

function object(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function own(value, key) {
  return object(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function string(value) {
  return typeof value === "string";
}

function nullableString(value) {
  return value === null || string(value);
}

function integer(value, min = Number.NEGATIVE_INFINITY) {
  return Number.isInteger(value) && value >= min;
}

function apiVersion(value) {
  return integer(value, 1) && SUPPORTED_API_VERSIONS.includes(value);
}

function stringList(value) {
  return Array.isArray(value) && value.every(string);
}

const REQUIRED_JOB_FIELDS = Object.freeze([
  "api_version",
  "job_id",
  "revision",
  "state",
  "name",
  "areas",
  "mode",
  "vacuum_power",
  "mop_intensity",
  "mop_route",
  "passes",
  "source",
  "reason",
  "note",
  "dedupe_key",
  "required_on",
  "required_off",
  "settings_policy",
  "created_at",
  "updated_at",
  "active_attempt_id",
  "retries_job_id",
  "failure_code",
]);

export function isJobRecord(value) {
  if (!object(value) || !REQUIRED_JOB_FIELDS.every((field) => own(value, field))) return false;
  if (!apiVersion(value.api_version) || !string(value.job_id) || !integer(value.revision, 0)) return false;
  if (!JOB_STATES.has(value.state) || !stringList(value.areas) || value.areas.length === 0 || new Set(value.areas).size !== value.areas.length) return false;
  if (!MODES.has(value.mode) || !integer(value.passes, 1) || value.passes > 10) return false;
  if (!POLICIES.has(value.settings_policy)) return false;
  if (!string(value.created_at) && !Number.isFinite(value.created_at)) return false;
  if (!string(value.updated_at) && !Number.isFinite(value.updated_at)) return false;
  for (const field of [
    "name",
    "vacuum_power",
    "mop_intensity",
    "mop_route",
    "source",
    "reason",
    "note",
    "dedupe_key",
    "active_attempt_id",
    "retries_job_id",
    "failure_code",
  ]) {
    if (!nullableString(value[field])) return false;
  }
  for (const field of ["vacuum_power", "mop_intensity"]) {
    if (value[field] !== null && !LEVELS.has(value[field])) return false;
  }
  if (value.mop_route !== null && !ROUTES.has(value.mop_route)) return false;
  if (!stringList(value.required_on) || !stringList(value.required_off)) return false;
  if (new Set(value.required_on).size !== value.required_on.length || new Set(value.required_off).size !== value.required_off.length) return false;
  if (value.required_on.some((item) => value.required_off.includes(item))) return false;
  if (value.readiness !== undefined && value.readiness !== null && !isReadiness(value.readiness)) return false;
  for (const field of ["assigned_robot_id", "blocked_reason", "active_work_unit_id"]) {
    if (value[field] !== undefined && !nullableString(value[field])) return false;
  }
  for (const field of ["started_at", "finished_at"]) {
    if (value[field] !== undefined && value[field] !== null && !string(value[field]) && !Number.isFinite(value[field])) return false;
  }
  if (value.work_units !== undefined && (!Array.isArray(value.work_units) || !value.work_units.every(isWorkUnit))) return false;
  return true;
}

function isWorkUnit(value) {
  return object(value) && string(value.work_unit_id) && string(value.operation) && string(value.state) && stringList(value.area_ids);
}

export function isReadiness(value) {
  return (
    object(value) &&
    READINESS_STATES.has(value.state) &&
    stringList(value.failed_on) &&
    stringList(value.failed_off) &&
    stringList(value.unknown)
  );
}

export function isQueuePage(value) {
  return (
    object(value) &&
    apiVersion(value.api_version) &&
    integer(value.commit_id, 0) &&
    integer(value.queue_revision, 0) &&
    QUEUE_MODES.has(value.mode) &&
    typeof value.needs_attention === "boolean" &&
    integer(value.total, 0) &&
    integer(value.offset, 0) &&
    integer(value.limit, 1) &&
    value.limit <= 100 &&
    Array.isArray(value.jobs) &&
    value.jobs.length <= value.limit &&
    value.jobs.every(isJobRecord)
  );
}

export function isJobListPage(value) {
  return (
    object(value) &&
    apiVersion(value.api_version) &&
    integer(value.total, 0) &&
    integer(value.offset, 0) &&
    integer(value.limit, 1) &&
    value.limit <= 100 &&
    Array.isArray(value.jobs) &&
    value.jobs.length <= value.limit &&
    value.jobs.every(isJobRecord)
  );
}

export function isDescribeResponse(value) {
  return (
    object(value) &&
    apiVersion(value.api_version) &&
    string(value.integration_version) &&
    stringList(value.capabilities) &&
    object(value.limits) &&
    integer(value.limits.max_page_size, 1) &&
    integer(value.limits.max_areas_per_job, 1) &&
    integer(value.limits.max_passes, 1)
  );
}

export function isSubscriptionEvent(value) {
  return (
    object(value) &&
    apiVersion(value.api_version) &&
    integer(value.commit_id, 0) &&
    integer(value.queue_revision, 0) &&
    QUEUE_MODES.has(value.mode) &&
    integer(value.pending_jobs, 0) &&
    typeof value.needs_attention === "boolean" &&
    (value.sequence === undefined || integer(value.sequence, 0)) &&
    (value.attention_job_ids === undefined || stringList(value.attention_job_ids))
  );
}

function isRobot(value) {
  if (!object(value) || !string(value.robot_id) || !string(value.name) || !string(value.adapter)) return false;
  if (!string(value.vacuum_entity_id) || !AVAILABILITIES.has(value.availability)) return false;
  if (value.battery_percentage !== null && !Number.isFinite(value.battery_percentage)) return false;
  if (!nullableString(value.active_job_id) || !nullableString(value.active_area_id) || !nullableString(value.blocked_reason)) return false;
  if (!stringList(value.allowed_area_ids) || !nullableString(value.map_image_entity_id) || !object(value.capabilities)) return false;
  return (
    stringList(value.capabilities.operations) &&
    integer(value.capabilities.max_passes, 1) &&
    string(value.capabilities.pass_scope) &&
    stringList(value.capabilities.vacuum_levels) &&
    stringList(value.capabilities.water_levels) &&
    stringList(value.capabilities.mop_routes) &&
    typeof value.capabilities.cancel === "boolean"
  );
}

export function isRobotsResponse(value) {
  return object(value) && apiVersion(value.api_version) && Array.isArray(value.robots) && value.robots.every(isRobot);
}

function isArea(value) {
  return (
    object(value) &&
    string(value.area_id) &&
    (value.last_vacuumed_at === null || string(value.last_vacuumed_at) || Number.isFinite(value.last_vacuumed_at)) &&
    (value.last_mopped_at === null || string(value.last_mopped_at) || Number.isFinite(value.last_mopped_at)) &&
    (value.vacuum_due_at === null || string(value.vacuum_due_at) || Number.isFinite(value.vacuum_due_at)) &&
    (value.mop_due_at === null || string(value.mop_due_at) || Number.isFinite(value.mop_due_at)) &&
    DUE_STATES.has(value.due_state) &&
    nullableString(value.release_entity_id) &&
    stringList(value.blocking_entity_ids) &&
    stringList(value.open_job_ids)
  );
}

export function isAreasStatusResponse(value) {
  return object(value) && apiVersion(value.api_version) && Array.isArray(value.areas) && value.areas.every(isArea);
}

function pageArgs(input, maybeLimit) {
  const options = typeof input === "object" && input !== null ? input : { offset: input, limit: maybeLimit };
  const offset = options.offset === undefined ? 0 : options.offset;
  const limit = options.limit === undefined ? 50 : options.limit;
  if (!integer(offset, 0) || !integer(limit, 1) || limit > 100) throw new TypeError("invalid page arguments");
  return { offset, limit };
}

export function queueGetMessage(input, maybeLimit) {
  const { offset, limit } = pageArgs(input, maybeLimit);
  return Object.freeze({ type: WS.QUEUE_GET, offset, limit });
}

export function jobGetMessage(jobId) {
  if (typeof jobId !== "string" || !jobId.trim()) throw new TypeError("job_id is required");
  return Object.freeze({ type: WS.JOB_GET, job_id: jobId });
}

export function jobsListMessage(input, maybeLimit) {
  const options = typeof input === "object" && input !== null ? input : { offset: input, limit: maybeLimit };
  const { offset, limit } = pageArgs(options);
  const result = { type: WS.JOBS_LIST, offset, limit };
  if (Array.isArray(options.states)) {
    if (!options.states.every(string)) throw new TypeError("invalid states filter");
    result.states = Object.freeze([...options.states]);
  }
  if (options.order !== undefined) {
    if (options.order !== "created_desc" && options.order !== "created_asc") throw new TypeError("invalid order");
    result.order = options.order;
  }
  return Object.freeze(result);
}

export function describeMessage() {
  return Object.freeze({ type: WS.DESCRIBE });
}

export function subscribeMessage() {
  return Object.freeze({ type: WS.SUBSCRIBE });
}

export function robotsListMessage() {
  return Object.freeze({ type: WS.ROBOTS_LIST });
}

export function areasStatusMessage() {
  return Object.freeze({ type: WS.AREAS_STATUS });
}

export function responseGuardFor(message) {
  const type = message && message.type;
  return {
    [WS.QUEUE_GET]: isQueuePage,
    [WS.JOB_GET]: isJobRecord,
    [WS.JOBS_LIST]: isJobListPage,
    [WS.DESCRIBE]: isDescribeResponse,
    [WS.SUBSCRIBE]: (value) => value === undefined || value === null || isSubscriptionEvent(value),
    [WS.ROBOTS_LIST]: isRobotsResponse,
    [WS.AREAS_STATUS]: isAreasStatusResponse,
  }[type] || object;
}

export function assertResponse(value, guard, detail = "response shape") {
  if (typeof guard !== "function" || !guard(value)) throw new BackendError("invalid_response", detail);
  return value;
}

export function assertSupportedApiVersion(value) {
  if (!apiVersion(value)) throw new BackendError("invalid_response", "unsupported api_version");
  return value;
}

export { REQUIRED_JOB_FIELDS };
