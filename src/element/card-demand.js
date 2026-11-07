// The scopes a card reads, by slot. The base set serves the shell; the active view, the page on
// screen and a dialog above it add their own. See internal dev doc §6 "Sitzung" ("Bedarf").

import { overlayFor, viewFor } from "../views/index.js";

// A view's options as configured, each missing one at its default.
export function resolvedOptions(definition, requested = {}) {
  const resolved = {};
  for (const [name, descriptor] of Object.entries(definition?.optionsSchema || {})) resolved[name] = requested[name] === undefined ? descriptor.default : requested[name];
  return resolved;
}

export function cardDemand({ ui, config, language, model, tabs, layers }) {
  const requests = {
    queue: { name: "queue", params: { offset: ui.pages.queue ?? 0, limit: config.page_size } },
    openJobs: { name: "openJobs", params: {} },
    rooms: { name: "rooms", params: {} },
    robots: { name: "robots", params: {} },
    candidates: { name: "candidates", params: {} },
    registry: { name: "registry", params: {} },
    setup: { name: "setup", params: {} },
    errorTexts: { name: "errorTexts", params: { language } },
  };
  const add = (list) => {
    for (const request of list || []) requests[request.slot || request.name] = { name: request.name, params: request.params || {} };
  };
  const definition = viewFor(tabs?.active);
  if (definition?.scopes) add(definition.scopes({ ui, model, options: resolvedOptions(definition, tabs.activeTab?.options), config }));
  for (const overlay of Object.values(layers)) {
    const overlayDefinition = overlay ? overlayFor(overlay.kind) : null;
    if (overlayDefinition?.scopes) add(overlayDefinition.scopes({ ui, overlay, config }));
  }
  return requests;
}
