"use strict";
// Wire records as the integration wrote them in its recordings (internal dev doc §10), for
// unit tests of the card's readers. Each builder takes a recorded record and lays a test's
// overrides over it; nothing here imitates a rule of the integration. Error frames are Home
// Assistant's transport shapes with the integration's own texts.

const { loadRecording, recordedAnswer } = require("./recordings.js");

const DOMAIN = "vacuum_orchestrator";
const VOI_API_VERSION = 4;
const query = (name) => ({ type: `${DOMAIN}/configuration/get`, query: name });
const copy = (value) => JSON.parse(JSON.stringify(value));

// Every successful answer of a recording to a request like `match`, in order.
function answers(name, match) {
  const { steps } = loadRecording(name);
  const results = new Map(steps.filter((step) => step.receive?.type === "result" && step.receive.success).map((step) => [step.receive.id, step.receive.result]));
  const sends = steps.filter((step) => step.send && Object.entries(match).every(([key, value]) => JSON.stringify(step.send[key]) === JSON.stringify(value)) && results.has(step.send.id));
  if (!sends.length) throw new Error(`${name} has no successful answer to ${JSON.stringify(match)}`);
  return sends.map((step) => copy(results.get(step.send.id)));
}

// The last successful answer of a recording to a request like `match`: the richest state.
const lastAnswer = (name, match) => answers(name, match).at(-1);

const cache = new Map();
function recorded(key, read) {
  if (!cache.has(key)) cache.set(key, read());
  return copy(cache.get(key));
}

// The showcase's busy afternoon: a running job, waiting jobs, every release kind.
const queuePage = () => recorded("queue", () => lastAnswer("showcase", { type: `${DOMAIN}/queue/get`, offset: 0, limit: 25 }));
const openJobsPage = () => recorded("openJobs", () => lastAnswer("showcase", { type: `${DOMAIN}/jobs/list`, offset: 0, limit: 100, states: ["dispatching", "running", "canceling", "needs_attention"] }));
const collection = (name) => recorded(name, () => lastAnswer("showcase", query(name)));
const metadata = (page) => ({ commit_id: page.commit_id, runtime_id: page.runtime_id, runtime_sequence: page.runtime_sequence, server_time: page.server_time });

function wireJob(overrides = {}) {
  return { ...queuePage().jobs[1], ...overrides };
}

// A job the queue has started: its progress and the actions of started work.
function wireRunningJob(overrides = {}) {
  return { ...openJobsPage().jobs[0], ...overrides };
}

function wireJobDefaults(overrides = {}) {
  return { ...queuePage().job_defaults, ...overrides };
}

function wireQueueRun(overrides = {}) {
  return { ...queuePage().queue_run, ...overrides };
}

function wireQueuePage(jobs = [], overrides = {}) {
  return { ...queuePage(), total: jobs.length, jobs, ...overrides };
}

function wireJobListPage(jobs = [], overrides = {}) {
  const page = openJobsPage();
  return { api_version: page.api_version, total: jobs.length, offset: 0, limit: 50, jobs, ...metadata(page), ...overrides };
}

function wirePage(key, items = [], overrides = {}) {
  return { api_version: VOI_API_VERSION, total: items.length, offset: 0, limit: 50, [key]: items, ...metadata(queuePage()), ...overrides };
}

const rooms = () => collection("get_rooms").rooms;
const roomWith = (predicate) => rooms().find(predicate);

// The dining room: released permanently and cleaned once.
function wireRoom(overrides = {}) {
  const { due_policy: duePolicy, occupancy, due, ...rest } = overrides;
  const room = rooms()[0];
  return { ...room, ...rest, due_policy: { ...room.due_policy, ...(duePolicy || {}) }, occupancy: { ...room.occupancy, ...(occupancy || {}) }, due: { ...room.due, ...(due || {}) } };
}

// The conservatory's door, which must be open before a robot drives in.
function wireRoomRequirement(overrides = {}) {
  return { ...roomWith((room) => room.requirements.length).requirements[0], ...overrides };
}

function wireRelease(overrides = {}) {
  return { ...roomWith((room) => room.release?.kind === "timed").release, ...overrides };
}

function wireStamp(overrides = {}) {
  return { ...roomWith((room) => room.last_cleaning?.vacuum).last_cleaning.vacuum, ...overrides };
}

function wireDue(overrides = {}) {
  return { ...rooms()[0].due.vacuum, ...overrides };
}

const robot = () => collection("get_robots").robots[0];

function wireRobotConfiguration(overrides = {}) {
  return { ...robot().configuration, ...overrides };
}

function wireRobotCapabilities(overrides = {}) {
  return { ...robot().capabilities, ...overrides };
}

function wireRobot(overrides = {}) {
  const { configuration, capabilities, ...rest } = overrides;
  return {
    ...robot(),
    configuration: wireRobotConfiguration(configuration || {}),
    capabilities: capabilities === null ? null : wireRobotCapabilities(capabilities || {}),
    ...rest,
  };
}

function wireCandidate(overrides = {}) {
  return { ...collection("get_robot_candidates").candidates[0], ...overrides };
}

// The dining room mop template.
function wireTemplate(overrides = {}) {
  return { ...collection("get_templates").templates[1], ...overrides };
}

function wireRun(overrides = {}) {
  return { ...collection("get_history").runs[0], ...overrides };
}

// The studio's running job: Rocky's plan for it and the attempt under way.
const executions = () => recorded("executions", () => answers("showcase", query("get_job_execution")));
const execution = () => executions().find((answer) => answer.attempts.length);

function wireReadiness(overrides = {}) {
  return { ...execution().robots[0].readiness, ...overrides };
}

// The conservatory's door, closed: a requirement the next start would fail.
function wireRequirementResult(overrides = {}) {
  const blocked = executions().flatMap((answer) => answer.robots).map((item) => item.readiness).find((readiness) => readiness.requirements.length)
    ?? openJobsPage().jobs.concat(queuePage().jobs).map((job) => job.readiness).find((readiness) => readiness?.requirements.length);
  return { ...blocked.requirements[0], ...overrides };
}

// A preview of vacuuming one room: the settings on offer and Rocky's answer.
const preview = () => recorded("preview", () => answers("showcase", query("preview_job")).find((answer) => answer.mode === "vacuum" && answer.robots.length));

function wirePreview(overrides = {}) {
  return { ...preview(), ...overrides };
}

function wireResolvedSetting(overrides = {}) {
  return { ...preview().robots[0].settings[0], ...overrides };
}

function wireExecutionRobot(overrides = {}) {
  return { ...execution().robots[0], ...overrides };
}

function wireAttempt(overrides = {}) {
  return { ...execution().attempts[0], ...overrides };
}

function wireExecution(overrides = {}) {
  return { ...execution(), ...overrides };
}

const tracePage = () => recorded("trace", () => lastAnswer("showcase", { ...query("get_trace"), parameters: { offset: 0, limit: 100 } }));

function wireTraceRecord(overrides = {}) {
  return { ...tracePage().records.at(-1), ...overrides };
}

function wireTracePage(records = [], overrides = {}) {
  return { ...tracePage(), total: records.length, records, ...overrides };
}

function wireDiagnostics(overrides = {}) {
  return { ...collection("get_diagnostics"), ...overrides };
}

const events = (name) => loadRecording(name).steps.filter((step) => step.receive?.type === "event").map((step) => step.receive.event);

function wireSubscriptionEvent(overrides = {}) {
  return { ...copy(events("showcase").at(-1)), ...overrides };
}

// What a subscriber hears while no runtime is loaded.
function wireUnloadedEvent() {
  return copy(events("reload").find((event) => event.loaded === false));
}

function wireManifest(overrides = {}) {
  return { ...copy(recordedAnswer("setup", { type: "manifest/get", integration: DOMAIN })), ...overrides };
}

function wireRegistryEntry(entityId, id, overrides = {}) {
  const [entry] = recorded("registry", () => lastAnswer("showcase", { type: "config/entity_registry/list" }));
  return { ...entry, entity_id: entityId, id, platform: entityId.split(".")[0], device_id: null, disabled_by: null, hidden_by: null, ...overrides };
}

// The integration's exception texts, as Home Assistant serves them.
const exceptionResources = (language) => recorded(`exceptions:${language}`, () => recordedAnswer("showcase", { type: "frontend/get_translations", language, category: "exceptions", integration: [DOMAIN] })).resources;

function exceptionText(code, language = "en") {
  return exceptionResources(language)[`component.${DOMAIN}.exceptions.${code}.message`] ?? code;
}

// Every code the integration has an exception text for.
function exceptionCodes(language = "en") {
  return Object.keys(exceptionResources(language)).map((key) => key.split(".")[3]);
}

function translated(code, detail) {
  return { translation_key: code, translation_domain: DOMAIN, translation_placeholders: { code, detail: detail ?? "" } };
}

// Home Assistant error frames as `home-assistant-js-websocket` rejects them.
const haError = Object.freeze({
  serviceValidation: (code, detail = null) => ({ code: "service_validation_error", message: `Validation error: ${exceptionText(code)}`, ...translated(code, detail) }),
  homeAssistant: (message) => ({ code: "home_assistant_error", message }),
  unauthorized: () => ({ code: "unauthorized", message: "Unauthorized" }),
  unknownCommand: () => ({ code: "unknown_command", message: "Unknown command." }),
  notFound: (message = "Integration not found") => ({ code: "not_found", message }),
  invalidFormat: (message = "extra keys not allowed") => ({ code: "invalid_format", message }),
  voi: (code, detail = null) => ({ code, message: exceptionText(code), ...translated(code, detail) }),
  connectionLost: () => ({ type: "result", success: false, error: { code: 3, message: "Connection lost" } }),
});

module.exports = {
  VOI_API_VERSION,
  wireReadiness,
  wireJob,
  wireRunningJob,
  wireJobDefaults,
  wireQueueRun,
  wireQueuePage,
  wireJobListPage,
  wirePage,
  wireStamp,
  wireDue,
  wireRelease,
  wireRoomRequirement,
  wireRoom,
  wireRobotConfiguration,
  wireRobotCapabilities,
  wireRobot,
  wireCandidate,
  wireTemplate,
  wireRun,
  wireRequirementResult,
  wirePreview,
  wireResolvedSetting,
  wireExecutionRobot,
  wireAttempt,
  wireExecution,
  wireTraceRecord,
  wireTracePage,
  wireDiagnostics,
  wireSubscriptionEvent,
  wireUnloadedEvent,
  wireManifest,
  wireRegistryEntry,
  exceptionText,
  exceptionCodes,
  haError,
};
