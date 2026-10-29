// What the card reads from Home Assistant's frontend object, and nothing more: states, areas,
// the admin flag, the operations the integration offers and Home Assistant's state formatter.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/backend/home-assistant.js");

test("the facts are taken from the hass object without copying its state objects", async () => {
  const { readHomeAssistant } = await load();
  const states = { "vacuum.rocky": { state: "docked" } };
  const hass = {
    states,
    areas: { library: { name: "Library" } },
    user: { is_admin: false },
    services: { vacuum_orchestrator: { run_queue: {}, create_job: {} }, light: { turn_on: {} } },
    // Home Assistant words a state object's own state, or another value of that entity.
    formatEntityState: (...args) => `formatted ${args.length > 1 ? args[1] : args[0].state} (${args.length})`,
  };
  const home = readHomeAssistant(hass);
  assert.equal(home.states, states);
  assert.equal(home.admin, false);
  assert.deepEqual(home.operations, ["create_job", "run_queue"]);
  assert.equal(home.formatState({ state: "docked" }), "formatted docked (1)");
  assert.equal(home.formatState({ state: "docked" }, "cleaning"), "formatted cleaning (2)", "another value of the same entity");
  assert.equal(Object.isFrozen(states), false);
});

test("missing parts read as unknown, not as permissions or offers", async () => {
  const { readHomeAssistant } = await load();
  const home = readHomeAssistant(null);
  assert.deepEqual({ ...home }, { states: null, areas: null, admin: null, operations: [], formatState: null, formatName: null });
  assert.equal(readHomeAssistant({ user: {} }).admin, null);
});

test("while the integration is loaded its card commands are offered beside its registered actions", async () => {
  const { readHomeAssistant } = await load();
  const services = { vacuum_orchestrator: { run_queue: {} } };
  const loaded = readHomeAssistant({ services, config: { components: ["vacuum_orchestrator"] } });
  assert.deepEqual(loaded.operations, ["complete_setup", "hold_job", "release_job_hold", "release_rooms", "renew_job_hold", "revoke_rooms", "run_queue"]);
  assert.deepEqual(readHomeAssistant({ services, config: { components: [] } }).operations, ["run_queue"]);
});

test("a new hass counts as a change only where the card read it (UI-31)", async () => {
  const { hassChanged } = await load();
  const vacuum = { state: "docked" };
  const states = { "vacuum.rocky": vacuum, "sensor.outdoor": { state: "12" } };
  const hass = { states, areas: {}, user: {}, themes: {}, services: {}, config: {}, connection: {} };
  const watched = { entityIds: ["vacuum.rocky"], allStates: false };
  assert.equal(hassChanged(hass, { ...hass, states: { ...states, "sensor.outdoor": { state: "13" } } }, watched), false, "a state no view shows");
  assert.equal(hassChanged(hass, { ...hass, states: { ...states, "vacuum.rocky": { state: "cleaning" } } }, watched), true, "the robot's state");
  assert.equal(hassChanged(hass, { ...hass, areas: {} }, watched), true, "a replaced registry part");
  assert.equal(hassChanged(hass, { ...hass, states: { ...states } }, { ...watched, allStates: true }), true, "an editor lists every entity");
  assert.equal(hassChanged(hass, hass, watched), false);
  assert.equal(hassChanged(null, hass, watched), true, "the first hass");
  assert.equal(hassChanged(hass, { ...hass }, null), true, "before the first model");
});
