"use strict";
// Builds the card domain model for a named household from source modules: the fake integration
// behind a real transport and session on a virtual clock, the card's scope requests, and Home
// Assistant's facts. Presentation tests read views from exactly what the card would see.

const { createFakeOrchestrator, VirtualClock } = require("./fake-orchestrator.js");
const { FIXED_NOW, SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

const tick = async (rounds = 16) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

// The scopes every card holds, as the element requests them.
const BASE_REQUESTS = Object.freeze({
  queue: { name: "queue", params: { offset: 0, limit: 25 } },
  openJobs: { name: "openJobs", params: {} },
  rooms: { name: "rooms", params: {} },
  robots: { name: "robots", params: {} },
  candidates: { name: "candidates", params: {} },
  registry: { name: "registry", params: {} },
});

const errorTextsRequest = (language) => ({ name: "errorTexts", params: { language } });

// `requests`: extra slots, e.g. { templates: { name: "templates", params: {} } }.
async function modelFor(scenario = "typical", { requests = {}, admin = true, language = "en", fake: fakeOptions = {}, needsEntityCatalog = false, setup = null } = {}) {
  const { createTransport } = await import("../../src/backend/transport.js");
  const { createSession } = await import("../../src/backend/session.js");
  const { readHomeAssistant } = await import("../../src/backend/home-assistant.js");
  const { buildCardDomainModel } = await import("../../src/application/card-domain-model.js");
  const { textService } = await import("../../src/i18n/text-service.js");
  const { affordanceContext } = await import("../../src/domain/affordances.js");
  const clock = new VirtualClock(FIXED_NOW);
  const household = SCENARIOS[scenario]();
  const fake = createFakeOrchestrator({ seed: household.seed, clock, admin, ...fakeOptions });
  if (setup) setup(fake);
  const hass = fake.attachTo(hassFor(household, { language, admin }));
  const platform = { now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle), isDocumentHidden: () => false };
  const session = createSession({ transport: createTransport({ getHass: () => hass, platform }), platform, getHass: () => hass });
  const all = { ...BASE_REQUESTS, errorTexts: errorTextsRequest(language), ...requests };
  session.syncHass();
  await tick();
  session.setDemand("test", Object.values(all));
  await tick();
  const model = buildCardDomainModel({ snapshot: session.getSnapshot(), requests: all, home: readHomeAssistant(hass), nowMs: FIXED_NOW, needsEntityCatalog });
  session.dispose();
  const texts = textService(language, { backend: model.errorTexts });
  const context = affordanceContext({ canCommand: model.permissions.canCommand, operations: model.operations, pending: model.pending });
  return { model, texts, context, fake, household };
}

module.exports = { modelFor, BASE_REQUESTS, FIXED_NOW };
