// Every error frame Home Assistant hands back for a card request becomes one failure record
// with the integration's code. Boundary: decoding only; wording belongs to presentation.

const test = require("node:test");
const assert = require("node:assert/strict");
const { haError } = require("../../fixtures/voi/wire.js");

const load = () => import("../../../src/backend/error-decoding.js");

test("an action's validation error yields the code and detail of its translation fields", async () => {
  const { decodeError } = await load();
  assert.deepEqual({ ...decodeError(haError.serviceValidation("job_not_editable"), "service") }, { ok: false, code: "job_not_editable", detail: null, channel: "service" });
  const withDetail = decodeError(haError.serviceValidation("unknown_area", "garage"), "service");
  assert.equal(withDetail.code, "unknown_area");
  assert.equal(withDetail.detail, "garage");
});

test("an integration WebSocket error yields the same record as the action", async () => {
  const { decodeError } = await load();
  assert.deepEqual({ ...decodeError(haError.voi("unknown_room", "room-x"), "ws") }, { ok: false, code: "unknown_room", detail: "room-x", channel: "ws" });
  assert.equal(decodeError(haError.voi("unknown_job"), "ws").detail, null);
});

test("the English message is never read for the code", async () => {
  const { decodeError } = await load();
  const frame = { ...haError.serviceValidation("robot_busy"), message: "Validation error: unknown_job: job-1" };
  assert.equal(decodeError(frame, "service").code, "robot_busy");
  assert.equal(decodeError({ code: "service_validation_error", message: "Validation error: job_not_editable" }, "service").code, "invalid_request");
});

test("translation fields of another domain do not name an integration code", async () => {
  const { decodeError } = await load();
  const foreign = { code: "home_assistant_error", message: "Service called another service", translation_domain: "websocket_api", translation_key: "child_service_not_found", translation_placeholders: {} };
  assert.equal(decodeError(foreign, "service").code, "unknown");
});

test("permission errors from actions and from admin-only WebSocket types both read unauthorized", async () => {
  const { decodeError } = await load();
  assert.equal(decodeError(haError.homeAssistant("Unauthorized"), "service").code, "unauthorized");
  assert.equal(decodeError(haError.unauthorized(), "ws").code, "unauthorized");
  const other = decodeError(haError.homeAssistant("Entity not available"), "service");
  assert.equal(other.code, "unknown");
  assert.equal(other.detail, "Entity not available");
});

test("schema, missing-action, unknown-type and lost-connection frames have their own codes", async () => {
  const { decodeError } = await load();
  assert.equal(decodeError(haError.invalidFormat(), "ws").code, "invalid_request");
  assert.equal(decodeError(haError.notFound("Service vacuum_orchestrator.x not found."), "service").code, "service_not_found");
  assert.equal(decodeError(haError.notFound(), "ws").code, "not_found");
  assert.equal(decodeError(haError.unknownCommand(), "ws").code, "unknown_command");
  assert.equal(decodeError(haError.connectionLost(), "ws").code, "connection_lost");
  assert.equal(decodeError({ code: 3 }, "service").code, "connection_lost");
});

test("anything else is unknown, and a failure record passes through unchanged", async () => {
  const { decodeError } = await load();
  const { backendFailure } = await import("../../../src/domain/backend-errors.js");
  assert.equal(decodeError(null, "ws").code, "unknown");
  assert.equal(decodeError("socket closed", "ws").detail, "socket closed");
  assert.equal(decodeError({ message: "no code" }, "ws").code, "unknown");
  const record = backendFailure("timeout", { channel: "ws" });
  assert.equal(decodeError(record, "service"), record);
});
