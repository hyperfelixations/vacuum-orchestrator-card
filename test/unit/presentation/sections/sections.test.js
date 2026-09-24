"use strict";
// The section view models. Every model here is built through the real normalizers from wire
// records, so these tests fail when the domain contract and the views drift apart.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireArea, wireJob, wireRobot } = require("../../../fixtures/wire.js");

const ALL_CAPABILITIES = [
  "queueRead",
  "jobRead",
  "jobsHistory",
  "jobCreate",
  "jobUpdate",
  "jobDelete",
  "jobMove",
  "jobStart",
  "jobCancel",
  "jobRetry",
  "queueRun",
  "queuePause",
  "queueResume",
  "areasRead",
  "robotsRead",
  "jobProgress",
  "jobBlockedReason",
];

const JOB = {
  revision: 3,
  name: "Kitchen job",
  vacuum_power: "high",
  passes: 2,
  source: "test",
  reason: "routine",
  required_on: ["input_boolean.cleaning_allowed"],
  updated_at: "2026-09-17T00:05:00Z",
  readiness: { state: "ready", failed_on: [], failed_off: [], unknown: [] },
};

async function textsFor(language = "en") {
  const { translate } = await import("../../../../src/i18n/translate.js");
  const formatters = await import("../../../../src/i18n/formatters.js");
  const t = (key, vars) => translate(language, key, vars);
  return {
    language,
    t,
    formatNumber: (value, digits = 0) => formatters.formatNumber(language, value, digits),
    formatDateTime: (value) => formatters.formatDateTime(language, value),
    formatRelative: (nowMs, thenMs) => formatters.formatRelative(language, nowMs, thenMs),
    formatDuration: (value) => formatters.formatDuration(language, value, t),
  };
}

// Built through buildCardDomainModel, exactly as the element builds it.
async function modelWith({ queue = [], history = [], active = [], areas = [], robots = [], capabilities = ALL_CAPABILITIES, pending = {}, isAdmin = true } = {}) {
  const { buildCardDomainModel } = await import("../../../../src/application/card-domain-model.js");
  const { initialState } = await import("../../../../src/backend/store.js");
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const { normalizeAreaStatus } = await import("../../../../src/domain/areas.js");
  const { normalizeRobot } = await import("../../../../src/domain/robots.js");
  const state = initialState();
  state.connection.state = "connected";
  state.capabilities = {
    ...state.capabilities,
    negotiated: true,
    values: Object.fromEntries(Object.keys(state.capabilities.values).map((key) => [key, capabilities.includes(key)])),
  };
  const pendingJobs = queue.map(normalizeJob).map((job, index) => ({ ...job, position: index + 1 }));
  state.queue = { ...state.queue, available: true, mode: "running", total: pendingJobs.length, limit: 25, pending: pendingJobs };
  state.active = { available: true, jobs: active.map(normalizeJob) };
  state.history = { available: true, jobs: history.map(normalizeJob), total: history.length, offset: 0, limit: 25 };
  state.areas = { available: capabilities.includes("areasRead"), items: areas.map(normalizeAreaStatus) };
  state.robots = { available: capabilities.includes("robotsRead"), items: robots.map(normalizeRobot) };
  state.commands.pending = pending;
  return buildCardDomainModel({
    backendState: state,
    areaRegistry: { kitchen: { name: "Kitchen", icon: "mdi:countertop" }, hall: { name: "Hall" } },
    states: { "input_boolean.cleaning_allowed": { state: "on", attributes: { friendly_name: "Cleaning allowed" } } },
    user: { is_admin: isAdmin },
    nowMs: Date.parse("2026-09-17T00:10:00Z"),
  });
}

test("queue rows expose action states, keyed identity, settings and pending feedback", async () => {
  const { buildQueueViewModel } = await import("../../../../src/presentation/sections/queue-vm.js");
  const model = await modelWith({
    queue: [wireJob({ ...JOB, job_id: "job-1" }), wireJob({ job_id: "job-2", areas: ["hall"] })],
    pending: { "job:job-1": { commandId: "voc-1", action: "move_job" } },
  });
  const view = buildQueueViewModel({ model, texts: await textsFor(), options: { timeFormat: "absolute" } });

  assert.deepEqual(view.pending.map((row) => row.jobId), ["job-1", "job-2"]);
  assert.equal(view.pending[0].positionText, "01");
  assert.equal(view.pending[0].pending, true);
  assert.equal(view.pending[0].actions.moveDown.reason, "command_pending");
  assert.equal(view.pending[1].actions.moveDown.reason, "at_boundary");
  assert.equal(view.pending[0].settings.find((item) => item.key === "passes").value, "2×");
  assert.equal(view.pending[0].settings.find((item) => item.key === "vacuumPower").value, "High");
  assert.equal(view.pending[1].areasText, "Hall");
  assert.match(view.pending[0].timeLabel, /2026/);
});

// `auto` means relative time; it silently fell back to the absolute date before.
test("the default time format is relative to the caller's clock", async () => {
  const { buildQueueViewModel } = await import("../../../../src/presentation/sections/queue-vm.js");
  const model = await modelWith({ queue: [wireJob(JOB)] });
  const view = buildQueueViewModel({ model, texts: await textsFor(), options: { timeFormat: "auto" }, nowMs: Date.parse("2026-09-17T00:10:00Z") });
  assert.equal(view.pending[0].timeLabel, "5 minutes ago");
});

// The row controls and the two card-wide controls answer to the same policy, so a read-only
// user must find every one of them locked with the same reason.
test("a read-only user sees every control disabled with its reason", async () => {
  const { buildQueueViewModel } = await import("../../../../src/presentation/sections/queue-vm.js");
  const { buildCardControls } = await import("../../../../src/presentation/shell/controls.js");
  const model = await modelWith({ queue: [wireJob(JOB)], isAdmin: false });
  const texts = await textsFor();
  const view = buildQueueViewModel({ model, texts });
  const controls = buildCardControls({ model, config: {}, texts });
  assert.equal(view.pending[0].actions.start.reason, "read_only");
  assert.equal(view.pending[0].actions.edit.reason, "read_only");
  assert.equal(controls.queue.ariaDisabled, true);
  assert.equal(controls.queue.title, "This user cannot change jobs");
  assert.equal(controls.primary.ariaDisabled, true);
});

test("history rows format terminal results and durations", async () => {
  const { buildHistoryViewModel } = await import("../../../../src/presentation/sections/history-vm.js");
  const model = await modelWith({
    history: [wireJob({ state: "failed", failure_code: "job_not_startable", started_at: "2026-09-17T00:00:00Z", finished_at: "2026-09-17T00:02:00Z" })],
  });
  const row = buildHistoryViewModel({ model, texts: await textsFor(), options: { timeFormat: "absolute" } }).rows[0];
  assert.equal(row.terminal, true);
  assert.equal(row.durationLabel, "2 min");
  assert.equal(row.resultLabel, "This job cannot be started.");
  assert.equal(row.actions.retry.state, "enabled");
});

test("rooms and robots render target data", async () => {
  const { buildRoomsViewModel } = await import("../../../../src/presentation/sections/rooms-vm.js");
  const { buildRobotsViewModel } = await import("../../../../src/presentation/sections/robots-vm.js");
  const model = await modelWith({
    areas: [wireArea({ due_state: "vacuum_due", vacuum_due_at: "2026-09-17T00:00:00Z", blocking_entity_ids: ["input_boolean.cleaning_allowed"], open_job_ids: ["job-1"] })],
    robots: [wireRobot({ active_area_id: "kitchen" })],
  });
  const texts = await textsFor("en");
  const rooms = buildRoomsViewModel({ model, texts, nowMs: Date.parse("2026-09-17T00:10:00Z") });
  assert.equal(rooms.available, true);
  assert.equal(rooms.rows[0].name, "Kitchen");
  assert.equal(rooms.rows[0].overdue, true);
  assert.equal(rooms.rows[0].dueStateLabel, "Vacuuming due");
  assert.equal(rooms.rows[0].blockingEntities[0].label, "Cleaning allowed");

  const robots = buildRobotsViewModel({ model, texts });
  assert.equal(robots.rows[0].batteryLabel, "87%");
  assert.equal(robots.rows[0].activeAreaLabel, "Kitchen");
  assert.deepEqual(robots.rows[0].allowedAreas.map((area) => area.name), ["Kitchen", "Hall"]);
});

test("rooms, robots and history degrade explicitly without their capability", async () => {
  const { buildRoomsViewModel } = await import("../../../../src/presentation/sections/rooms-vm.js");
  const { buildRobotsViewModel } = await import("../../../../src/presentation/sections/robots-vm.js");
  const { buildHistoryViewModel } = await import("../../../../src/presentation/sections/history-vm.js");
  const model = await modelWith({ capabilities: ["queueRead"] });
  const texts = await textsFor();
  assert.deepEqual(buildRoomsViewModel({ model, texts }).unavailable, { capability: "areasRead" });
  assert.deepEqual(buildRobotsViewModel({ model, texts }).unavailable, { capability: "robotsRead" });
  assert.deepEqual(buildHistoryViewModel({ model, texts }).unavailable, { capability: "jobsHistory" });
});

test("the editor offers every area without robot data and validates before saving", async () => {
  const { applyDraftChange, createDraft, draftToUpdatePatch } = await import("../../../../src/domain/job-draft.js");
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const { buildEditorFormViewModel } = await import("../../../../src/presentation/sections/editor-form-vm.js");
  const texts = await textsFor();
  const model = await modelWith({ capabilities: ALL_CAPABILITIES.filter((key) => key !== "robotsRead") });

  const empty = buildEditorFormViewModel({ model, texts, draft: createDraft(null) });
  assert.deepEqual(empty.groups.map((group) => group.key), ["areas", "mode", "settings", "source", "requirements"]);
  const areas = empty.groups[0].fields[0];
  assert.deepEqual(areas.options.map((option) => option.label), ["Hall", "Kitchen"]);
  assert.match(areas.hint.text, /Robot data/);
  assert.equal(areas.error, "Select at least one room.");
  assert.equal(empty.saveEnabled, false);
  const requirement = empty.groups.find((group) => group.key === "requirements").fields[0];
  assert.deepEqual(requirement.options.map((option) => option.label), ["Cleaning allowed"]);

  const createView = buildEditorFormViewModel({ model, texts, draft: applyDraftChange(createDraft(null), "areas", ["kitchen"]) });
  assert.equal(createView.saveEnabled, true);
  assert.deepEqual(createView.payload.areas, ["kitchen"]);

  const job = normalizeJob(wireJob(JOB));
  const edited = applyDraftChange(createDraft(job), "note", "changed");
  assert.deepEqual(draftToUpdatePatch(edited, job), { note: "changed" });
  const editView = buildEditorFormViewModel({ model, texts, draft: edited, job, mode: "edit" });
  assert.equal(editView.mode, "edit");
  assert.deepEqual(editView.payload, { note: "changed" });
});

test("detail projection includes readiness entities, phases and robot assignment", async () => {
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const { buildJobDetailViewModel } = await import("../../../../src/presentation/sections/job-detail-vm.js");
  const running = wireJob({
    ...JOB,
    state: "running",
    assigned_robot_id: "robot-1",
    active_work_unit_id: "unit-1",
    work_units: [
      { work_unit_id: "unit-1", operation: "vacuum", state: "active", area_ids: ["kitchen"] },
      { work_unit_id: "unit-2", operation: "mop", state: "completed", area_ids: ["kitchen"] },
    ],
    readiness: { state: "blocked", failed_on: ["input_boolean.cleaning_allowed"], failed_off: [], unknown: [] },
  });
  const model = await modelWith({ active: [running], robots: [wireRobot({ name: "Mopster" })] });
  const detail = buildJobDetailViewModel({ job: normalizeJob(running), model, texts: await textsFor() });
  assert.equal(detail.assignedRobotName, "Mopster");
  assert.equal(detail.progress.value, 0.5);
  assert.equal(detail.progress.units[0].active, true);
  assert.equal(detail.readiness.failedOn[0].label, "Cleaning allowed");
  assert.equal(detail.actions.cancel.state, "enabled");
});
