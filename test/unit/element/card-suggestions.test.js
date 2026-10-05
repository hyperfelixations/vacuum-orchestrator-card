// The card picker's "by entity" path: the card is offered for every vacuum and every entity of
// the integration, and the suggestion is the bare card, which sets itself up.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/element/card-suggestions.js");

const hass = {
  states: { "vacuum.rocky": { state: "docked" }, "sensor.kitchen_temperature": { state: "21" }, "sensor.voi_mode": { state: "running" } },
  entities: { "sensor.voi_mode": { entity_id: "sensor.voi_mode", platform: "vacuum_orchestrator" }, "switch.voi_pause": { platform: "vacuum_orchestrator" }, "sensor.kitchen_temperature": { platform: "zha" } },
};

test("a vacuum or an entity of the integration suggests the bare card", async () => {
  const { suggestionForEntity } = await load();
  for (const entityId of ["vacuum.rocky", "sensor.voi_mode", "switch.voi_pause"]) {
    assert.deepEqual(suggestionForEntity(hass, entityId), { config: { type: "custom:vacuum-orchestrator-card" } }, entityId);
  }
});

test("other entities, unknown vacuums and malformed input suggest nothing", async () => {
  const { suggestionForEntity } = await load();
  const inherited = Object.create({ "vacuum.ghost": { state: "docked" } });
  const cases = [
    [hass, "sensor.kitchen_temperature"],
    [hass, "vacuum.missing"],
    [hass, "light.vacuum_orchestrator"],
    [hass, null],
    [hass, 42],
    [null, "vacuum.rocky"],
    [undefined, undefined],
    ["hass", "vacuum.rocky"],
    [{ states: [], entities: [] }, "vacuum.rocky"],
    [{ states: inherited }, "vacuum.ghost"],
    [{ states: { "vacuum.rocky": null } }, "vacuum.rocky"],
    [{ entities: { "sensor.x": null } }, "sensor.x"],
    [{ entities: { "sensor.x": { platform: ["vacuum_orchestrator"] } } }, "sensor.x"],
    [{ states: {}, entities: { __proto__: { platform: "vacuum_orchestrator" } } }, "__proto__"],
  ];
  for (const [input, entityId] of cases) assert.equal(suggestionForEntity(input, entityId), null, String(entityId));
});
