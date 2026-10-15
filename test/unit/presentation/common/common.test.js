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

test("a robot's status line joins Home Assistant's state and battery with the lease", async () => {
  const { robotStatus } = await import("../../../../src/presentation/common/robot-status.js");
  const { robotsOf } = await import("../../../../src/presentation/common/lookups.js");
  const en = await texts();
  const { model } = await modelFor("showcase", { from: BUSY });
  const [rocky] = robotsOf(model).map((robot) => robotStatus(robot, model, en));
  assert.deepEqual([rocky.state, rocky.battery, rocky.tone], [en.t("vacuum.state.cleaning"), 100, "running"]);
  assert.equal(rocky.summary, `Rocky · ${en.t("vacuum.state.cleaning")} · 100 %`);
  const choice = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const [docked, dusty] = robotsOf(choice.model).map((robot) => robotStatus(robot, choice.model, en));
  assert.deepEqual([docked.tone, docked.state, docked.battery], ["ready", en.t("vacuum.state.docked"), 100]);
  assert.deepEqual([dusty.name, dusty.battery], ["Dusty", null], "a robot without a battery reading shows none");
});

test("trace rows word known events and states and keep unknown ones as reported", async () => {
  const { model } = await modelFor("showcase", { from: BUSY, requests: { trace: { name: "trace", params: {} } } });
  const { traceRows } = await import("../../../../src/presentation/common/trace.js");
  const en = await texts();
  const records = model.slots.trace.data.records;
  const rows = traceRows(records, { model, texts: en, withJob: true });
  const confirmed = rows[records.findIndex((record) => record.event === "attempt_transition" && record.details.state === "start_confirmed")];
  assert.equal(confirmed.event, en.t("trace.event.attempt_transition"));
  assert.match(confirmed.detail, new RegExp(en.t("attempt.state.startConfirmed")));
  assert.match(confirmed.detail, /Studio/, "the job is named by its room");
  const unknown = traceRows([{ sequence: 1, timestamp: NOW, event: "teleport", details: { state: "beamed" } }], { model, texts: en });
  assert.deepEqual([unknown[0].event, unknown[0].detail], ["teleport", "beamed"]);
  assert.equal(traceRows([{ sequence: 2, timestamp: NOW, event: "internal_error", details: {} }], { model, texts: en })[0].tone, "attention");
});
