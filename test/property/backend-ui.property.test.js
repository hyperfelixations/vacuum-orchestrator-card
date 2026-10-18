// Controls over generated verdicts of the integration, rights, offered operations and commands in
// flight: a control shows exactly where the integration offers the action or explains why not;
// the card's own reasons come first, then the integration's; nothing else decides.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../helpers/voi-records.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

const OPERATIONS = ["move_job", "update_job", "start_job", "cancel_job", "delete_job", "retry_job", "correct_job"];
// Each control with the integration's action name and the operation that carries it out.
const CONTROLS = {
  moveUp: ["move_up", "move_job"],
  moveDown: ["move_down", "move_job"],
  edit: ["edit", "update_job"],
  start: ["start", "start_job"],
  cancel: ["cancel", "cancel_job"],
  delete: ["delete", "delete_job"],
  retry: ["retry", "retry_job"],
  correct: ["correct", "correct_job"],
};
// Reasons that keep a control visible and explained.
const EXPLAINED = ["robot_busy", "job_held", "start_delayed"];

// The actions that run a job; the integration lets at most one of them apply to a job at a time.
const RUN_ACTIONS = ["start", "cancel", "retry"];

// A recorded job with a generated verdict per action: none, offered, not applicable, or refused
// with an explanation; of the run actions only one may apply.
function generatedJob(random, notApplicable) {
  const actions = {};
  const run = random.pick([...RUN_ACTIONS, null]);
  for (const [name] of Object.values(CONTROLS)) {
    const kind = RUN_ACTIONS.includes(name) && name !== run ? 2 * random.integer(2) : random.integer(4);
    if (kind === 1) actions[name] = { available: true, reason: null, detail: null };
    else if (kind === 2) actions[name] = { available: false, reason: random.pick(notApplicable), detail: null };
    else if (kind === 3) actions[name] = { available: false, reason: random.pick(EXPLAINED), detail: null };
  }
  return W.wireJob({ job_id: "j", actions });
}

test("job controls follow the integration's verdicts, rights, offered operations and commands in flight", async () => {
  const { affordanceContext, jobAffordances, NOT_APPLICABLE } = await import("../../src/domain/affordances.js");
  const { normalizeJob } = await import("../../src/domain/job.js");
  const notApplicable = [...NOT_APPLICABLE];
  const { cases, seed } = propertyRun("BACKEND_UI", 400, "voc-backend-ui-v3");
  checkGenerated({
    name: "job affordances",
    cases,
    seed,
    generate: (random) => ({
      wire: generatedJob(random, notApplicable),
      canCommand: random.integer(4) !== 0,
      operations: OPERATIONS.filter(() => random.integer(5) !== 0),
      pending: random.integer(4) === 0,
    }),
    classify: ({ canCommand, pending }) => `${canCommand ? "admin" : "read-only"}/${pending ? "pending" : "idle"}`,
    verify({ wire, canCommand, operations, pending }) {
      const context = affordanceContext({ canCommand, operations, pending: pending ? ["job:j"] : [] });
      const decisions = jobAffordances(normalizeJob(wire), context);
      for (const [control, [name, operation]] of Object.entries(CONTROLS)) {
        const verdict = wire.actions[name];
        const decision = decisions[control];
        const shown = canCommand && Boolean(verdict) && (verdict.available || !NOT_APPLICABLE.has(verdict.reason));
        assert.equal(decision.state !== "hidden", shown, `${control} shows where the integration offers or explains it, to whom may change things`);
        if (!canCommand && verdict && (verdict.available || !NOT_APPLICABLE.has(verdict.reason))) assert.equal(decision.reason, "read_only", "read only hides it with its reason");
        if (!shown) continue;
        if (!operations.includes(operation)) assert.deepEqual([decision.state, decision.reason], ["disabled", "operation_missing"]);
        else if (pending) assert.deepEqual([decision.state, decision.reason], ["disabled", "command_pending"]);
        else if (verdict.available) assert.equal(decision.state, "enabled", control);
        else assert.deepEqual([decision.state, decision.reason, decision.source], ["disabled", verdict.reason, "integration"]);
      }
    },
  });
});

test("rendered queue rows never show a control the decisions hide", async () => {
  const { JSDOM } = require("jsdom");
  const { affordanceContext, jobAffordances, NOT_APPLICABLE } = await import("../../src/domain/affordances.js");
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { jobRow } = await import("../../src/views/parts.js");
  const notApplicable = [...NOT_APPLICABLE];
  const { createRenderContext } = await import("../../src/render/primitives/render-context.js");
  const { textService } = await import("../../src/i18n/text-service.js");
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const context = createRenderContext(document, { texts: textService("en") });
  const { cases, seed } = propertyRun("BACKEND_UI", 200, "voc-backend-ui-v3");
  checkGenerated({
    name: "rendered rows",
    cases,
    seed: seed ^ 0x6a09e667,
    // The main action a row's state can call for: a waiting job's start or deletion, a running one's
    // cancel.
    generate: (random) => {
      const state = random.pick(["queued", "running"]);
      return { wire: generatedJob(random, notApplicable), state, canCommand: random.boolean(), main: state === "queued" ? random.pick([null, "start", "delete"]) : "cancel" };
    },
    verify({ wire, state, canCommand, main }) {
      const actions = jobAffordances(normalizeJob(wire), affordanceContext({ canCommand, operations: OPERATIONS }));
      const row = { jobId: "j", position: state === "queued" ? "2" : "", title: "<Job>", rooms: "", showRooms: false, modeIcon: "mdi:robot-vacuum", modeLabel: "Vacuum", state, stateLabel: state, stateTone: "neutral", showState: false, status: null, progress: null, settings: [], outcome: null, pending: false, actions, main: main ? { key: main, decision: actions[main] } : null, menuOpen: false, time: "" };
      const host = document.createElement("div");
      host.innerHTML = jobRow(context, row);
      const shown = [...host.querySelectorAll("[data-action]")].map((node) => node.dataset.action).filter((action) => action !== "open-job");
      const manage = Object.entries({ moveUp: "move-job", moveDown: "move-job", edit: "edit-job" }).filter(([control]) => actions[control].state !== "hidden").map(([, action]) => action);
      const shownMain = main && actions[main].state !== "hidden" ? [{ start: "start-job", delete: "delete-job", cancel: "cancel-job" }[main]] : [];
      assert.deepEqual(shown, [...shownMain, ...manage, ...(manage.length ? ["toggle-menu"] : [])], "the main action, the managing icons, the menu holding them on a narrow card");
      assert.equal(host.querySelectorAll(".voc-job-main-action").length, shownMain.length, "at most one main action");
      assert.equal(host.querySelector(".voc-job-title").textContent, "<Job>");
    },
  });
});
