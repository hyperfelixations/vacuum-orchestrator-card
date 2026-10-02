// Controls over generated jobs, rights, offered actions and commands in flight: nothing is enabled
// for a read-only user, for a missing action or for a job with a command in flight, and a
// control is hidden exactly where the integration's preconditions refuse it.

const test = require("node:test");
const assert = require("node:assert/strict");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

const STATES = ["queued", "dispatching", "running", "canceling", "completed", "failed", "cancelled", "needs_attention", "unknown"];
const OPERATIONS = ["move_job", "update_job", "start_job", "cancel_job", "delete_job", "retry_job"];
const VISIBLE = {
  edit: (state) => state === "queued",
  start: (state) => state === "queued",
  moveUp: (state) => state === "queued",
  moveDown: (state) => state === "queued",
  cancel: (state) => ["queued", "dispatching", "running"].includes(state),
  delete: (state) => ["queued", "completed", "failed", "cancelled"].includes(state),
  retry: (state) => ["completed", "failed", "cancelled"].includes(state),
};
const OPERATION_OF = { edit: "update_job", start: "start_job", moveUp: "move_job", moveDown: "move_job", cancel: "cancel_job", delete: "delete_job", retry: "retry_job" };

test("job controls follow state, rights, offered actions and commands in flight", async () => {
  const { affordanceContext, jobAffordances } = await import("../../src/domain/affordances.js");
  const { cases, seed } = propertyRun("BACKEND_UI", 400, "voc-backend-ui-v2");
  checkGenerated({
    name: "job affordances",
    cases,
    seed,
    generate: (random) => ({
      state: random.pick(STATES),
      canCommand: random.integer(4) !== 0,
      operations: OPERATIONS.filter(() => random.integer(5) !== 0),
      pending: random.integer(4) === 0,
      position: 1 + random.integer(5),
      total: 5,
    }),
    classify: ({ state, canCommand }) => `${state}/${canCommand ? "admin" : "read-only"}`,
    verify({ state, canCommand, operations, pending, position, total }) {
      const context = affordanceContext({ canCommand, operations, pending: pending ? ["job:j"] : [] });
      const decisions = jobAffordances({ jobId: "j", state }, context, { position, total });
      for (const [control, visible] of Object.entries(VISIBLE)) {
        const decision = decisions[control];
        assert.equal(decision.state === "hidden", !visible(state), `${control} visibility in ${state}`);
        if (decision.state === "hidden") continue;
        if (!canCommand) assert.deepEqual([decision.state, decision.reason], ["disabled", "read_only"]);
        else if (!operations.includes(OPERATION_OF[control])) assert.deepEqual([decision.state, decision.reason], ["disabled", "operation_missing"]);
        else if (pending) assert.deepEqual([decision.state, decision.reason], ["disabled", "command_pending"]);
        else if (control === "moveUp" && position === 1) assert.equal(decision.reason, "at_boundary");
        else if (control === "moveDown" && position === total) assert.equal(decision.reason, "at_boundary");
        else assert.equal(decision.state, "enabled", control);
      }
    },
  });
});

test("rendered queue rows never show a control the decisions hide", async () => {
  const { JSDOM } = require("jsdom");
  const { affordanceContext, jobAffordances } = await import("../../src/domain/affordances.js");
  const { jobRow } = await import("../../src/views/parts.js");
  const { createRenderContext } = await import("../../src/render/primitives/render-context.js");
  const { textService } = await import("../../src/i18n/text-service.js");
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const context = createRenderContext(document, { texts: textService("en") });
  const { cases, seed } = propertyRun("BACKEND_UI", 200, "voc-backend-ui-v2");
  checkGenerated({
    name: "rendered rows",
    cases,
    seed: seed ^ 0x6a09e667,
    generate: (random) => ({ state: random.pick(STATES), canCommand: random.boolean() }),
    verify({ state, canCommand }) {
      const actions = jobAffordances({ jobId: "j", state }, affordanceContext({ canCommand, operations: OPERATIONS }), { position: 2, total: 3 });
      const row = { jobId: "j", position: state === "queued" ? "2" : "", title: "<Job>", rooms: "", showRooms: false, modeIcon: "mdi:robot-vacuum", modeLabel: "Vacuum", state, stateLabel: state, stateTone: "neutral", readiness: null, settings: [], outcome: null, pending: false, actions, time: "" };
      const host = document.createElement("div");
      host.innerHTML = jobRow(context, row);
      const shown = [...host.querySelectorAll("[data-action]")].map((node) => node.dataset.action).filter((action) => action !== "open-job");
      const expected = Object.entries({ moveUp: "move-job", moveDown: "move-job", edit: "edit-job", start: "start-job", cancel: "cancel-job", retry: "retry-job" })
        .filter(([control]) => actions[control].state !== "hidden" && (control !== "cancel" || state !== "queued"))
        .map(([, action]) => action);
      assert.deepEqual(shown, expected);
      const run = shown.filter((action) => ["start-job", "cancel-job", "retry-job"].includes(action));
      assert.ok(run.length <= 1 && (run.length === 0 || shown.at(-1) === run[0]), "the one run action sits in the trailing slot");
      assert.equal(host.querySelector(".voc-job-title").textContent, "<Job>");
    },
  });
});
