"use strict";
// A Home Assistant frontend `hass` object in the shapes the real one uses: `config.components`
// is a list, `entities` is the display registry (no states), `states` is the state machine.
// Integration behaviour comes from test/helpers/fake-orchestrator.js, attached on top.

function state(entityId, value = "unknown", attributes = {}) {
  return {
    entity_id: entityId,
    state: String(value),
    attributes,
    last_changed: "2026-09-17T00:00:00Z",
    last_updated: "2026-09-17T00:00:00Z",
  };
}

function createHass({ states = {}, areas = {}, language = "en", components = [], isAdmin = true } = {}) {
  const services = [];
  return {
    states,
    entities: Object.fromEntries(Object.keys(states).map((entityId) => [entityId, { entity_id: entityId, platform: entityId.split(".")[0] }])),
    areas,
    services: {},
    config: { components: [...components], time_zone: "UTC" },
    user: { is_admin: isAdmin },
    locale: { language },
    language,
    connection: {
      subscribeMessage: async () => () => {},
      sendMessagePromise: async () => {
        throw Object.assign(new Error("unknown_command"), { code: "unknown_command" });
      },
    },
    callWS: async () => {
      throw Object.assign(new Error("unknown_command"), { code: "unknown_command" });
    },
    callService: async (domain, service, data) => {
      services.push({ domain, service, data });
      return { context: {} };
    },
    calledServices: services,
    hassUrl: (value) => value,
  };
}

module.exports = { createHass, state };
