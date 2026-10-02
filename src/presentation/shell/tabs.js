// Which views the card offers and which one is on screen (RCC views contract, without the
// carousel). Requested, available and active stay separate facts: a view the integration cannot
// serve is still listed when `show.unavailable_views` allows, so the user sees what is missing.

import { t } from "../common/texts.js";

function requested(config, definitions) {
  if (!Array.isArray(config?.views)) return null;
  const byType = new Map(definitions.map((definition) => [definition.key, definition]));
  return config.views.filter((entry) => byType.has(entry.type)).map((entry) => ({ definition: byType.get(entry.type), request: entry }));
}

export function availableView(definition, model) {
  const operations = new Set(model.operations || []);
  return model.phase === "ready" && (definition.requires || []).every((operation) => operations.has(operation));
}

export function buildTabs({ definitions = [], model = {}, config = {}, ui = {}, texts } = {}) {
  const entries = requested(config, definitions) ?? definitions.map((definition) => ({ definition, request: null }));
  const showUnavailable = config.show?.unavailable_views !== false;
  const candidates = entries
    .map(({ definition, request }) => {
      const auto = !request || request.enabled === "auto";
      const enabled = auto ? definition.defaultEnabled(model) !== false : request.enabled !== false;
      const available = availableView(definition, model);
      return {
        key: definition.key,
        icon: definition.icon,
        label: t(texts, `view.${definition.key}`),
        enabled,
        available,
        options: request?.options || {},
        startPreferred: auto && typeof definition.preferredStart === "function" && definition.preferredStart(model) === true,
      };
    })
    .filter((tab) => tab.enabled && (tab.available || showUnavailable));

  const usable = (key) => candidates.some((tab) => tab.key === key && tab.available);
  const active =
    (ui.view && candidates.some((tab) => tab.key === ui.view) ? ui.view : null) ||
    (config.start_view && usable(config.start_view) ? config.start_view : null) ||
    candidates.find((tab) => tab.startPreferred && tab.available)?.key ||
    candidates.find((tab) => tab.available)?.key ||
    candidates[0]?.key ||
    null;
  const tabs = candidates.map((tab) => ({ ...tab, active: tab.key === active }));
  const showTabs = config.show?.tabs;
  return {
    tabs,
    active,
    activeTab: tabs.find((tab) => tab.active) || null,
    visible: showTabs === false ? false : showTabs === true ? tabs.length > 0 : tabs.length > 1,
  };
}
