// One loader per data scope. A loader reads bounded pages through the transport, checks each
// page's envelope and hands back normalized, frozen data — or the failure record. Offset pages
// are not a server-side snapshot, so collections are de-duplicated by stable id.
// See internal dev doc §6 "Scopes".

import { backendFailure } from "../domain/backend-errors.js";
import { normalizeExecution } from "../domain/execution.js";
import { normalizeJob } from "../domain/job.js";
import { normalizeQueuePage } from "../domain/queue.js";
import { normalizeCandidate, normalizeRobot } from "../domain/robots.js";
import { normalizeRoom } from "../domain/rooms.js";
import { normalizeRun } from "../domain/runs.js";
import { normalizeTemplate } from "../domain/templates.js";
import { normalizeDiagnosticsSummary, normalizeTracePage } from "../domain/trace.js";
import { PAGE_LIMIT, QUERY_COLLECTIONS, apiVersionOf, guards, isSupportedApiVersion, messages } from "./protocol.js";

// Safety bound for collections read page by page.
export const MAX_COLLECTION_PAGES = 20;

// Jobs that left the pending queue but are not finished.
export const OPEN_JOB_STATES = Object.freeze(["dispatching", "running", "canceling", "needs_attention"]);

// The integration's read models as its events name them, and the scopes that read each one.
// Trace, execution and diagnostics change without a commit and follow every event.
export const VIEW_SCOPES = Object.freeze({
  queue: Object.freeze(["queue", "job"]),
  jobs: Object.freeze(["openJobs", "jobLog", "job", "runs"]),
  rooms: Object.freeze(["rooms"]),
  robots: Object.freeze(["robots"]),
  templates: Object.freeze(["templates"]),
});
export const VOLATILE_SCOPES = Object.freeze(["trace", "execution", "diagnostics"]);

// The scopes an event's `changed` list concerns; anything the card does not know means "all".
export function scopesForChanges(changed) {
  if (!Array.isArray(changed) || changed.some((name) => !Object.hasOwn(VIEW_SCOPES, name))) return "all";
  return new Set([...changed.flatMap((name) => VIEW_SCOPES[name]), ...VOLATILE_SCOPES]);
}

const invalid = (detail) => backendFailure("invalid_response", { detail });
const done = (data, view = null) => Object.freeze({ ok: true, data, view });

// The integration view a response was read at, or null without its metadata.
function viewOf(wire) {
  if (!wire || typeof wire.runtime_id !== "string" || !Number.isInteger(wire.runtime_sequence) || !Number.isInteger(wire.commit_id)) return null;
  return Object.freeze({ runtimeId: wire.runtime_id, sequence: wire.runtime_sequence, commitId: wire.commit_id });
}

// Pages of one collection form a view only within one runtime; the oldest page bounds it.
function oldestView(views) {
  if (!views.length || views.some((view) => !view || view.runtimeId !== views[0].runtimeId)) return null;
  return Object.freeze({ runtimeId: views[0].runtimeId, sequence: Math.min(...views.map((view) => view.sequence)), commitId: Math.min(...views.map((view) => view.commitId)) });
}

async function guarded(request, guard, detail) {
  const result = await request;
  if (!result.ok) return result;
  return guard(result.data) ? result : invalid(detail);
}

// Every page of a configuration query collection, de-duplicated by id in first-seen order.
async function collection(transport, query, idOf, normalize) {
  const { key, guard } = QUERY_COLLECTIONS[query];
  const byId = new Map();
  const views = [];
  let offset = 0;
  let total = 0;
  for (let pageIndex = 0; pageIndex < MAX_COLLECTION_PAGES; pageIndex += 1) {
    const result = await guarded(transport.ws(messages.query(query, { offset, limit: PAGE_LIMIT })), guard, query);
    if (!result.ok) return result;
    views.push(viewOf(result.data));
    total = result.data.total;
    for (const item of result.data[key].map(normalize).filter(Boolean)) if (!byId.has(idOf(item))) byId.set(idOf(item), item);
    offset += result.data[key].length;
    if (result.data[key].length === 0 || offset >= total) return done(Object.freeze({ items: Object.freeze([...byId.values()]), total, complete: true }), oldestView(views));
  }
  return done(Object.freeze({ items: Object.freeze([...byId.values()]), total, complete: false }), oldestView(views));
}

export async function loadQueue(transport, { offset = 0, limit = 25 } = {}) {
  const result = await guarded(transport.ws(messages.queueGet({ offset, limit })), guards.queuePage, "queue/get");
  if (!result.ok) return result;
  const apiVersion = apiVersionOf(result.data);
  if (!isSupportedApiVersion(apiVersion)) return backendFailure("api_incompatible", { detail: String(apiVersion) });
  return done(Object.freeze({ apiVersion, ...normalizeQueuePage(result.data) }), viewOf(result.data));
}

// The open jobs through the integration's state filter, every page, de-duplicated by id.
export async function loadOpenJobs(transport) {
  const found = new Map();
  const views = [];
  let offset = 0;
  let total = 0;
  for (let pageIndex = 0; pageIndex < MAX_COLLECTION_PAGES; pageIndex += 1) {
    const result = await guarded(transport.ws(messages.jobsList({ offset, limit: PAGE_LIMIT, states: OPEN_JOB_STATES })), guards.jobsPage, "jobs/list");
    if (!result.ok) return result;
    views.push(viewOf(result.data));
    total = result.data.total;
    for (const job of result.data.jobs.map(normalizeJob).filter(Boolean)) if (!found.has(job.jobId)) found.set(job.jobId, job);
    offset += result.data.jobs.length;
    if (result.data.jobs.length === 0 || offset >= total) return done(Object.freeze({ jobs: Object.freeze([...found.values()]), complete: true }), oldestView(views));
  }
  return done(Object.freeze({ jobs: Object.freeze([...found.values()]), complete: false }), oldestView(views));
}

export async function loadJobLog(transport, { offset = 0, limit = 25 } = {}) {
  const result = await guarded(transport.ws(messages.jobsList({ offset, limit })), guards.jobsPage, "jobs/list");
  if (!result.ok) return result;
  const { total, offset: pageOffset, limit: pageLimit } = result.data;
  return done(Object.freeze({ jobs: Object.freeze(result.data.jobs.map(normalizeJob).filter(Boolean)), total, offset: pageOffset, limit: pageLimit }), viewOf(result.data));
}

export async function loadJob(transport, { jobId }) {
  const result = await guarded(transport.ws(messages.jobGet(jobId)), guards.job, "job/get");
  if (!result.ok) return result;
  const job = normalizeJob(result.data);
  return job ? done(job, viewOf(result.data)) : invalid("job/get");
}

export const loadRooms = (transport) => collection(transport, "get_rooms", (room) => room.roomId, normalizeRoom);
export const loadRobots = (transport) => collection(transport, "get_robots", (robot) => robot.robotId, normalizeRobot);
export const loadCandidates = (transport) => collection(transport, "get_robot_candidates", (candidate) => candidate.registryId, normalizeCandidate);
export const loadTemplates = (transport) => collection(transport, "get_templates", (template) => template.templateId, normalizeTemplate);

export async function loadRuns(transport, { offset = 0, limit = 25 } = {}) {
  const result = await guarded(transport.ws(messages.query("get_history", { offset, limit })), guards.runsPage, "get_history");
  if (!result.ok) return result;
  const { total, offset: pageOffset, limit: pageLimit } = result.data;
  return done(Object.freeze({ runs: Object.freeze(result.data.runs.map(normalizeRun).filter(Boolean)), total, offset: pageOffset, limit: pageLimit }), viewOf(result.data));
}

export async function loadTrace(transport, { jobId = null } = {}) {
  const parameters = { offset: 0, limit: PAGE_LIMIT };
  if (jobId) parameters.job_id = jobId;
  const result = await guarded(transport.ws(messages.query("get_trace", parameters)), guards.tracePage, "get_trace");
  if (!result.ok) return result;
  return done(normalizeTracePage(result.data), viewOf(result.data));
}

export async function loadExecution(transport, { jobId }) {
  const result = await guarded(transport.ws(messages.query("get_job_execution", { job_id: jobId })), guards.execution, "get_job_execution");
  if (!result.ok) return result;
  return done(normalizeExecution(result.data), viewOf(result.data));
}

export async function loadDiagnostics(transport) {
  const result = await guarded(transport.ws(messages.query("get_diagnostics")), guards.diagnostics, "get_diagnostics");
  if (!result.ok) return result;
  return done(normalizeDiagnosticsSummary(result.data), viewOf(result.data));
}

export async function loadManifest(transport) {
  const result = await guarded(transport.ws(messages.manifest()), guards.manifest, "manifest/get");
  if (!result.ok) return result;
  return done(Object.freeze({ version: typeof result.data.version === "string" ? result.data.version : null, documentation: typeof result.data.documentation === "string" ? result.data.documentation : null }));
}

// Registry ids, entity ids and the identity of the integration's own entities. Read-only.
export async function loadEntityRegistry(transport) {
  const result = await guarded(transport.ws(messages.entityRegistry()), guards.entityRegistry, "config/entity_registry/list");
  if (!result.ok) return result;
  const entries = result.data
    .filter((entry) => entry && typeof entry.id === "string" && typeof entry.entity_id === "string")
    .map((entry) => Object.freeze({
      id: entry.id,
      entityId: entry.entity_id,
      platform: typeof entry.platform === "string" ? entry.platform : null,
      uniqueId: typeof entry.unique_id === "string" ? entry.unique_id : null,
      deviceId: typeof entry.device_id === "string" ? entry.device_id : null,
      disabled: Boolean(entry.disabled_by),
    }));
  return done(Object.freeze(entries));
}

const EXCEPTION_KEY = /^component\.vacuum_orchestrator\.exceptions\.([a-z0-9_]+)\.message$/;

// The integration's exception texts in one language, by error code.
export async function loadErrorTexts(transport, { language }) {
  const result = await guarded(transport.ws(messages.errorTexts(language)), guards.translations, "frontend/get_translations");
  if (!result.ok) return result;
  const texts = {};
  for (const [key, value] of Object.entries(result.data.resources)) {
    const match = EXCEPTION_KEY.exec(key);
    if (match && typeof value === "string" && value.trim()) texts[match[1]] = value;
  }
  return done(Object.freeze(texts));
}

export const SCOPE_LOADERS = Object.freeze({
  queue: loadQueue,
  openJobs: loadOpenJobs,
  jobLog: loadJobLog,
  rooms: loadRooms,
  robots: loadRobots,
  candidates: loadCandidates,
  templates: loadTemplates,
  runs: loadRuns,
  trace: loadTrace,
  execution: loadExecution,
  job: loadJob,
  diagnostics: loadDiagnostics,
  manifest: loadManifest,
  registry: loadEntityRegistry,
  errorTexts: loadErrorTexts,
});

export const SCOPES = Object.freeze(Object.keys(SCOPE_LOADERS));
