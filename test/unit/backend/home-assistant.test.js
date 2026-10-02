// What the card reads from Home Assistant's frontend object, and nothing more: states, areas,
// the admin flag, the integration's registered actions and Home Assistant's state formatter.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/backend/home-assistant.js");

test("the facts are taken from the hass object without copying its state objects", async () => {
  const { readHomeAssistant } = await load();
  const states = { "vacuum.rocky": { state: "docked" } };
  const hass = {
    states,
    areas: { kitchen: { name: "Kitchen" } },
    user: { is_admin: false },
    services: { vacuum_orchestrator: { run_queue: {}, create_job: {} }, light: { turn_on: {} } },
    formatEntityState: (state) => `formatted ${state.state}`,
  };
  const home = readHomeAssistant(hass);
  assert.equal(home.states, states);
  assert.equal(home.admin, false);
  assert.deepEqual(home.operations, ["create_job", "run_queue"]);
  assert.equal(home.formatState({ state: "docked" }), "formatted docked");
  assert.equal(Object.isFrozen(states), false);
});

test("missing parts read as unknown, not as permissions or offers", async () => {
  const { readHomeAssistant } = await load();
  const home = readHomeAssistant(null);
  assert.deepEqual({ ...home }, { states: null, areas: null, admin: null, operations: [], formatState: null });
  assert.equal(readHomeAssistant({ user: {} }).admin, null);
});
