// Every error frame Home Assistant hands back for a card request becomes one failure record
// with the integration's code. Boundary: decoding only; wording belongs to presentation.

const test = require("node:test");
const assert = require("node:assert/strict");
const { haError } = require("../../fixtures/voi/wire.js");

const load = () => import("../../../src/backend/error-decoding.js");

test("an action's validation error yields the integration's code and detail", async () => {
  const { decodeError } = await load();
  assert.deepEqual({ ...decodeError(haError.serviceValidation("job_not_editable"), "service") }, { ok: false, code: "job_not_editable", group: "job", detail: null, channel: "service" });
  const withDetail = decodeError(haError.serviceValidation("unknown_area", "garage"), "service");
  assert.equal(withDetail.code, "unknown_area");
  assert.equal(withDetail.detail, "garage");
});

test("a validation message without a code stays an invalid request with its text", async () => {
  const { decodeError } = await load();
  const failure = decodeError({ code: "service_validation_error", message: "Validation error: Something odd happened." }, "service");
  assert.equal(failure.code, "invalid_request");
  assert.equal(failure.detail, "Validation error: Something odd happened.");
});

test("a VOI WebSocket error keeps its code; a repeated code in the message is not a detail", async () => {
  const { decodeError } = await load();
  assert.equal(decodeError(haError.voi("unknown_job"), "ws").detail, null);
  const failure = decodeError(haError.voi("unknown_room", "unknown_room: room-x"), "ws");
  assert.equal(failure.code, "unknown_room");
  assert.equal(failure.detail, "room-x");
  assert.equal(decodeError(haError.voi("conflict", "The job changed meanwhile"), "ws").detail, "The job changed meanwhile");
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
