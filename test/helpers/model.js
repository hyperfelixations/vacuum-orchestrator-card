"use strict";
// Builds the card domain model at a mark of an integration recording from source modules: the
// recording behind a real transport and session on the recording's clock, the card's scope
// requests, and Home Assistant's facts as the recording has them. Presentation tests read views
// from exactly what the card would see.

const { createRecordedBackend } = require("./recorded-backend.js");
const { loadRecording } = require("./recordings.js");

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
  setup: { name: "setup", params: {} },
});

const errorTextsRequest = (language) => ({ name: "errorTexts", params: { language } });

// The first mark of a recording: where a card opens unless a test names another.
function firstMark(recording) {
  return recording.steps.find((step) => step.mark !== undefined)?.mark;
}

// `requests`: extra slots, e.g. { templates: { name: "templates", params: {} } }. `until`: home
// changes played after opening, in order.
async function modelFor(name, { from, until = [], requests = {}, admin, language = "en", needsEntityCatalog = false } = {}) {
  const { createTransport } = await import("../../src/backend/transport.js");
  const { createSession } = await import("../../src/backend/session.js");
  const { readHomeAssistant } = await import("../../src/backend/home-assistant.js");
  const { buildCardDomainModel } = await import("../../src/application/card-domain-model.js");
  const { textService } = await import("../../src/i18n/text-service.js");
  const { affordanceContext } = await import("../../src/domain/affordances.js");
  const recording = loadRecording(name);
  const clock = { time: 0, now: () => clock.time, advance: (ms) => (clock.time += ms) };
  const backend = createRecordedBackend(recording, { from: from ?? firstMark(recording), language, admin, clock });
  clock.time = backend.nowMs;
  const getHass = () => backend.hass;
  // Without timers the session reloads at once instead of after a quiet gap.
  const platform = { now: clock.now, monotonicNow: clock.now, isDocumentHidden: () => false };
  const session = createSession({ transport: createTransport({ getHass, platform }), platform, getHass });
  const all = { ...BASE_REQUESTS, errorTexts: errorTextsRequest(language), ...requests };
  session.syncHass();
  await tick();
  session.setDemand("test", Object.values(all));
  await tick();
  for (const change of until) {
    backend.until(change);
    session.syncHass();
    await tick();
  }
  const model = buildCardDomainModel({ snapshot: session.getSnapshot(), requests: all, home: readHomeAssistant(backend.hass), nowMs: session.now(), needsEntityCatalog });
  session.dispose();
  if (backend.failures.length) throw backend.failures[0];
  const texts = textService(language, { backend: model.errorTexts });
  const context = affordanceContext({ canCommand: model.permissions.canCommand, operations: model.operations, pending: model.pending });
  return { model, texts, context, backend };
}

module.exports = { modelFor, BASE_REQUESTS };
