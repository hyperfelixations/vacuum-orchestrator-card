// Shared presentation helpers: wording of codes and failures, time forms, paging, names of
// rooms, robots, entities and jobs, robot status lines and trace rows.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");
const { exceptionText } = require("../../../helpers/voi-records.js");

const BUSY = "A busy afternoon";
const NOW = Date.parse("2026-03-14T11:18:58Z");
// The card's texts with the integration's own texts for its codes, as the card reads them.
const texts = async (language = "en") => (await modelFor("showcase", { from: BUSY, language })).texts;
const bare = async (language) => (await import("../../../../src/i18n/text-service.js")).textService(language);
const common = () => import("../../../../src/presentation/common/texts.js");

test("an integration failure reads in the integration's own words, in the card's language", async () => {
  const { failureText } = await common();
  const de = await texts("de");
  assert.equal(failureText(de, { code: "job_not_editable", detail: "job-1" }), exceptionText("job_not_editable", "de"));
  assert.equal(failureText(await texts("en"), { code: "robot_busy" }), exceptionText("robot_busy"));
  assert.notEqual(exceptionText("robot_busy", "de"), exceptionText("robot_busy"));
  assert.equal(failureText(de, null), "");
});

test("the card words its own codes; a code without any text is named", async () => {
  const { failureText } = await common();
  const de = await texts("de");
  assert.equal(failureText(de, { code: "connection_lost" }), de.t("error.code.connection_lost"));
  assert.equal(failureText(de, { code: "unauthorized" }), de.t("error.code.unauthorized"));
  assert.match(failureText(de, { code: "some_future_code" }), /some_future_code/);
  assert.match(failureText(await bare("de"), { code: "robot_busy" }), /robot_busy/);
});

test("outcomes, reasons and due reasons fall back to naming the code", async () => {
  const { outcomeText, reasonText, readinessReasonText, dueReasonText } = await common();
  const en = await texts();
  assert.equal(outcomeText(en, "start_timeout"), en.t("failure.start_timeout"));
  assert.equal(outcomeText(en, "setting_confirmation_timeout"), exceptionText("setting_confirmation_timeout"));
  assert.match(outcomeText(en, "new_outcome"), /new_outcome/);
  assert.equal(outcomeText(en, null), null);
  assert.equal(reasonText(en, "room_not_released"), en.t("readiness.reason.room_not_released"));
  assert.equal(reasonText(en, "robot_busy"), exceptionText("robot_busy"));
  assert.match(reasonText(en, "mystery"), /mystery/);
  assert.match(readinessReasonText(en, "mystery"), /mystery/);
  assert.equal(dueReasonText(en, "never_cleaned"), en.t("due.reason.never_cleaned"));
  assert.equal(dueReasonText(en, null), null);
});

test("time_format: relative is always relative, absolute always a timestamp, auto switches after a day", async () => {
  const { moment, dateTime, relative, AUTO_RELATIVE_MS } = await common();
  const en = await texts();
  const hourAgo = NOW - 3600000;
  const twoDaysAgo = NOW - 2 * AUTO_RELATIVE_MS;
  assert.equal(moment(en, hourAgo, "auto", NOW), relative(en, hourAgo, NOW));
  assert.equal(moment(en, twoDaysAgo, "auto", NOW), dateTime(en, twoDaysAgo));
  assert.equal(moment(en, twoDaysAgo, "relative", NOW), relative(en, twoDaysAgo, NOW));
  assert.equal(moment(en, hourAgo, "absolute", NOW), dateTime(en, hourAgo));
  assert.equal(dateTime(en, null), "—");
});

test("paging appears only when a page does not hold everything", async () => {
  const { pagination } = await common();
  const en = await texts();
  assert.equal(pagination({ total: 10, offset: 0, limit: 25 }, en), null);
  const middle = pagination({ total: 60, offset: 25, limit: 25 }, en);
  assert.deepEqual([middle.page, middle.pages, middle.hasPrevious, middle.hasNext], [2, 3, true, true]);
  assert.equal(pagination(null, en), null);
});

test("names come from the integration, then Home Assistant, then the id", async () => {
  const { model } = await modelFor("showcase", { from: BUSY });
  const { roomIndex, roomName, robotName, entityName, jobTitle, findJob, roomsOf, robotsOf } = await import("../../../../src/presentation/common/lookups.js");
  const index = roomIndex(model);
  const dining = roomsOf(model).find((room) => room.areaId === "dining_room");
  const [rocky] = robotsOf(model);
  assert.equal(roomName(dining.roomId, index, model), "Dining Room");
  assert.equal(roomName("dining_room", index, model), "Dining Room", "an area alias finds its room");
  assert.equal(roomName("room-gone", index, model), "room-gone");
  assert.equal(robotName(rocky.robotId, model), "Rocky");
  assert.equal(robotName("legacy:unscoped", model), "legacy:unscoped");
  assert.equal(entityName("sensor.unknown_thing", model), "sensor.unknown_thing");
  const [conservatory, library] = model.slots.queue.data.jobs;
  assert.equal(jobTitle(findJob(model, library.jobId), index, model), "Library, thoroughly");
  assert.equal(jobTitle(findJob(model, conservatory.jobId), index, model), "Conservatory", "an unnamed job is named by its rooms");
  assert.equal(findJob(model, "job-nowhere"), null);
});

// UI-09, EXE-11: the state is the integration's vendor-neutral activity, Home Assistant's vacuum
// state only where the integration has none.
test("a robot's status line joins its activity and battery with the lease", async () => {
  const { robotStatus } = await import("../../../../src/presentation/common/robot-status.js");
  const { robotsOf } = await import("../../../../src/presentation/common/lookups.js");
  const en = await texts();
  const { model } = await modelFor("showcase", { from: BUSY });
  const [rocky] = robotsOf(model).map((robot) => robotStatus(robot, model, en));
  assert.deepEqual([rocky.state, rocky.battery, rocky.tone], [en.t("robot.phase.cleaning"), 100, "running"]);
  assert.equal(rocky.summary, `Rocky · ${en.t("robot.phase.cleaning")} · Battery 100 %`, "a percentage beside a job's progress names what it measures");
  const choice = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const [docked, dusty] = robotsOf(choice.model).map((robot) => robotStatus(robot, choice.model, en));
  assert.deepEqual([docked.tone, docked.state, docked.battery], ["ready", en.t("robot.phase.docked"), 100]);
  assert.deepEqual([dusty.name, dusty.battery], ["Dusty", null], "a robot without a battery reading shows none");
  const fault = await modelFor("device_fault", { from: "The job waits for the fix" });
  const [failing] = robotsOf(fault.model).map((robot) => robotStatus(robot, fault.model, en));
  assert.deepEqual([failing.state, failing.tone], [en.t("robot.phase.error"), "attention"], "an error outweighs the job the robot holds");
  const outside = await modelFor("external_run", { from: "The card opens" });
  const [external] = robotsOf(outside.model).map((robot) => robotStatus(robot, outside.model, en));
  assert.deepEqual([external.state, en.t("robot.phase.cleaningExternal")], [en.t("robot.phase.cleaningExternal"), "Cleaning outside Vacuum Orchestrator"]);
  // V6: a robot that cannot be reached has no current battery level; the last one is not shown.
  const lost = await modelFor("recovery", { from: "The job needs clarification" });
  const [unreachable] = robotsOf(lost.model).map((robot) => robotStatus(robot, lost.model, en));
  assert.deepEqual([unreachable.battery, unreachable.summary], [null, `Rocky · ${unreachable.state}`]);
  const unknown = robotStatus({ ...robotsOf(model)[0], activity: { phase: "unknown", external: false } }, model, en);
  assert.equal(unknown.state, en.t("vacuum.state.cleaning"), "without an activity, Home Assistant's state");
});

test("trace rows word known events and states and keep unknown ones as reported", async () => {
  const { model } = await modelFor("showcase", { from: BUSY, requests: { trace: { name: "trace", params: {} } } });
  const { traceRows } = await import("../../../../src/presentation/common/trace.js");
  const en = await texts();
  const records = model.slots.trace.data.records;
  const rows = traceRows(records, { model, texts: en, withJob: true });
  const record = records.find((entry) => entry.event === "attempt_transition" && entry.details.state === "start_confirmed");
  const confirmed = rows.find((row) => row.key === String(record.sequence));
  assert.equal(confirmed.event, en.t("trace.event.attempt_transition"));
  assert.match(confirmed.detail, new RegExp(en.t("attempt.state.startConfirmed")));
  assert.match(confirmed.detail, /Studio/, "the job is named by its room");
  const unknown = traceRows([{ sequence: 1, timestamp: NOW, event: "teleport", details: { state: "beamed" } }], { model, texts: en });
  assert.deepEqual([unknown[0].event, unknown[0].detail], ["teleport", "beamed"]);
  assert.equal(traceRows([{ sequence: 2, timestamp: NOW, event: "internal_error", details: {} }], { model, texts: en })[0].tone, "attention");
  // V6: a job not started for missing prerequisites is no error, and its reason is worded.
  const [blocked] = traceRows([{ sequence: 3, timestamp: NOW, event: "dispatch_blocked", details: { state: "blocked", reason: "job_prerequisites" } }], { model, texts: en });
  assert.deepEqual([blocked.event, blocked.tone], [en.t("trace.event.dispatch_blocked"), "neutral"]);
  assert.match(blocked.detail, new RegExp(en.t("trace.reason.job_prerequisites")));
  assert.doesNotMatch(blocked.detail, /job_prerequisites/);
  assert.equal(en.t("trace.event.dispatch_blocked"), "Not started yet");
  assert.doesNotMatch(blocked.detail, /blocked/, "the reason says it; the raw state does not");
  // The same entry within the shown second is counted wherever it stands, as a dispatcher cycling
  // through waiting jobs records it; a run of it across seconds is counted too.
  const again = { sequence: 4, timestamp: NOW, event: "dispatch_blocked", details: { state: "blocked", reason: "job_prerequisites" } };
  const counted = traceRows([{ ...again, sequence: 5 }, { sequence: 6, timestamp: NOW, event: "internal_error", details: {} }, again, { ...again, sequence: 7, timestamp: NOW - 60_000 }], { model, texts: en });
  assert.deepEqual(counted.map((row) => [row.event, row.count]), [[en.t("trace.event.dispatch_blocked"), 2], [en.t("trace.event.internal_error"), 1], [en.t("trace.event.dispatch_blocked"), 1]]);
});

// V6: an event log names the day once and each entry to the second; a run of the same entry is
// counted rather than repeated.
test("trace rows carry the day apart from the time to the second and count a run of the same entry", async () => {
  const { model } = await modelFor("showcase", { from: BUSY });
  const { traceRows } = await import("../../../../src/presentation/common/trace.js");
  const en = await texts();
  const blocked = (sequence, timestamp) => ({ sequence, timestamp, event: "dispatch_blocked", details: { reason: "job_prerequisites" } });
  const rows = traceRows([blocked(1, NOW), blocked(2, NOW - 7000), { sequence: 3, timestamp: NOW - 9000, event: "storage", details: { stage: "committed" } }, blocked(4, NOW - 11000), blocked(5, NOW - 86_400_000)], { model, texts: en });
  assert.deepEqual(rows.map((row) => [row.key, row.count]), [["1", 2], ["3", 1], ["4", 1], ["5", 1]]);
  assert.equal(rows[0].day, en.formatDateTime(NOW, { timeStyle: undefined }));
  assert.equal(rows[0].time, en.formatDateTime(NOW, { dateStyle: undefined, timeStyle: "medium" }));
  assert.match(rows[0].time, /\d:\d{2}:\d{2}/, "to the second");
  assert.notEqual(rows[3].day, rows[0].day);
});

// V6 (UI-04): every value the integration traces is worded; a vendor's own robot status, which the
// integration passes on as reported, is written out rather than shown as a code.
test("trace details word commands, stages, robot states, settings and vendor statuses", async () => {
  const { model } = await modelFor("showcase", { from: BUSY });
  const { traceRows } = await import("../../../../src/presentation/common/trace.js");
  const { robotsOf } = await import("../../../../src/presentation/common/lookups.js");
  const en = await texts();
  const detail = (event, details) => traceRows([{ sequence: 1, timestamp: NOW, event, details }], { model, texts: en })[0].detail;
  const rocky = robotsOf(model)[0].robotId;
  assert.equal(detail("command", { command: "create_job_from_template", stage: "returned" }), "Job from template · done");
  assert.equal(detail("command", { command: "release_rooms", stage: "rejected", reason: "job_prerequisites" }), "Release rooms · its prerequisites are not met yet · refused");
  assert.equal(detail("storage", { stage: "committed" }), "saved");
  assert.equal(detail("queue_run", { state: "running", stage: "idle_reset" }), "Running · grace period restarted");
  assert.equal(detail("robot_observation", { state: "busy", reason: "segment_cleaning", robot_id: rocky }), "Busy · Segment cleaning · Rocky");
  assert.equal(detail("robot_observation", { state: "available", reason: "docked", robot_id: rocky }), "Available · Docked · Rocky");
  assert.equal(detail("availability", { state: "offline", reason: "unavailable", robot_id: rocky }), "Offline · Unavailable · Rocky");
  assert.equal(detail("setting", { reason: "vacuum_power", stage: "unchanged", robot_id: rocky }), "Vacuum power · Rocky · already set");
  assert.equal(detail("setting", { reason: "cleaning_mode", stage: "confirmed" }), "Cleaning mode · confirmed");
  assert.equal(detail("physical_command", { reason: "returning", stage: "requested", robot_id: rocky }), "return to the dock · Rocky · requested");
  assert.equal(detail("recovery_resolved", { reason: "verified_stopped", stage: "abandoned", robot_id: rocky }), "confirmed stopped · Rocky · attempt given up");
  const { TRACE_COMMANDS, TRACE_STAGES, TRACE_ROBOT_STATES, TRACE_REASONS } = await import("../../../../src/presentation/common/trace.js");
  const { de } = await import("../../../../src/i18n/languages/de.js");
  const { en: english } = await import("../../../../src/i18n/languages/en.js");
  const keys = [...TRACE_COMMANDS].map((name) => `trace.command.${name}`).concat([...TRACE_STAGES].map((stage) => `trace.stage.${stage}`), [...TRACE_ROBOT_STATES].map((state) => `trace.robotState.${state}`), [...TRACE_REASONS].map((code) => `trace.reason.${code}`));
  assert.deepEqual(keys.filter((key) => !(key in english) || !(key in de)), []);
  assert.equal(TRACE_COMMANDS.size, 37, "every command the integration traces");
});
