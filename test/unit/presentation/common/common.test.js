// Shared presentation helpers: wording of codes and failures, time forms, paging, names of
// rooms, robots, entities and jobs, robot status lines and trace rows.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor, FIXED_NOW } = require("../../../helpers/model.js");

const texts = async (language = "en") => (await import("../../../../src/i18n/text-service.js")).textService(language);
const common = () => import("../../../../src/presentation/common/texts.js");

test("a failure reads in the integration's terms; an unknown code through its group", async () => {
  const { failureText } = await common();
  const en = await texts();
  assert.equal(failureText(en, { code: "job_not_editable" }), en.t("error.code.job_not_editable", { detail: "" }));
  assert.match(failureText(en, { code: "some_future_code" }), /some_future_code/);
  assert.equal(failureText(en, null), "");
});

test("outcomes, reasons and due reasons fall back to naming the code", async () => {
  const { outcomeText, reasonText, readinessReasonText, dueReasonText } = await common();
  const en = await texts();
  assert.equal(outcomeText(en, "start_timeout"), en.t("failure.start_timeout"));
  assert.match(outcomeText(en, "new_outcome"), /new_outcome/);
  assert.equal(outcomeText(en, null), null);
  assert.equal(reasonText(en, "room_not_released"), en.t("readiness.reason.room_not_released"));
  assert.equal(reasonText(en, "robot_busy"), en.t("error.code.robot_busy", { detail: "" }));
  assert.match(reasonText(en, "mystery"), /mystery/);
  assert.match(readinessReasonText(en, "mystery"), /mystery/);
  assert.equal(dueReasonText(en, "never_cleaned"), en.t("due.reason.never_cleaned"));
  assert.equal(dueReasonText(en, null), null);
});

test("time_format: relative is always relative, absolute always a timestamp, auto switches after a day", async () => {
  const { moment, dateTime, relative, AUTO_RELATIVE_MS } = await common();
  const en = await texts();
  const hourAgo = FIXED_NOW - 3600000;
  const twoDaysAgo = FIXED_NOW - 2 * AUTO_RELATIVE_MS;
  assert.equal(moment(en, hourAgo, "auto", FIXED_NOW), relative(en, hourAgo, FIXED_NOW));
  assert.equal(moment(en, twoDaysAgo, "auto", FIXED_NOW), dateTime(en, twoDaysAgo));
  assert.equal(moment(en, twoDaysAgo, "relative", FIXED_NOW), relative(en, twoDaysAgo, FIXED_NOW));
  assert.equal(moment(en, hourAgo, "absolute", FIXED_NOW), dateTime(en, hourAgo));
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
  const { model } = await modelFor("typical");
  const { roomIndex, roomName, robotName, entityName, jobTitle, findJob } = await import("../../../../src/presentation/common/lookups.js");
  const index = roomIndex(model);
  assert.equal(roomName("room-kitchen", index, model), "Kitchen");
  assert.equal(roomName("kitchen", index, model), "Kitchen", "an area alias finds its room");
  assert.equal(roomName("room-gone", index, model), "room-gone");
  assert.equal(robotName("robot-rocky", model), "Rocky");
  assert.equal(robotName("legacy:unscoped", model), "legacy:unscoped");
  assert.equal(entityName("binary_sensor.bedroom_window", model), "Bedroom window");
  assert.equal(entityName("sensor.unknown_thing", model), "sensor.unknown_thing");
  assert.equal(jobTitle(findJob(model, "job-kitchen"), index, model), "Kitchen and hall");
  assert.equal(jobTitle(findJob(model, "job-bedroom"), index, model), "Bedroom", "an unnamed job is named by its rooms");
  assert.equal(findJob(model, "job-nowhere"), null);
});

test("a robot's status line joins Home Assistant's state and battery with the lease", async () => {
  const { model } = await modelFor("typical");
  const { robotStatus } = await import("../../../../src/presentation/common/robot-status.js");
  const { robotsOf } = await import("../../../../src/presentation/common/lookups.js");
  const en = await texts();
  const [rocky, dusty] = robotsOf(model).map((robot) => robotStatus(robot, model, en));
  assert.deepEqual([rocky.state, rocky.battery, rocky.tone], [en.t("vacuum.state.cleaning"), 76, "running"]);
  assert.equal(rocky.summary, `Rocky · ${en.t("vacuum.state.cleaning")} · 76 %`);
  assert.deepEqual([dusty.tone, dusty.battery], ["ready", 100]);
});

test("trace rows word known events and states and keep unknown ones as reported", async () => {
  const { model } = await modelFor("typical", { requests: { trace: { name: "trace", params: {} } } });
  const { traceRows } = await import("../../../../src/presentation/common/trace.js");
  const en = await texts();
  const rows = traceRows(model.slots.trace.data.records, { model, texts: en, withJob: true });
  assert.equal(rows[0].event, en.t("trace.event.attempt_transition"));
  assert.match(rows[0].detail, new RegExp(en.t("attempt.state.startConfirmed")));
  assert.match(rows[0].detail, /Living room/);
  const unknown = traceRows([{ sequence: 1, timestamp: FIXED_NOW, event: "teleport", details: { state: "beamed" } }], { model, texts: en });
  assert.deepEqual([unknown[0].event, unknown[0].detail], ["teleport", "beamed"]);
  assert.equal(traceRows([{ sequence: 2, timestamp: FIXED_NOW, event: "internal_error", details: {} }], { model, texts: en })[0].tone, "attention");
});
