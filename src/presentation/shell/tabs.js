// Which sections the card offers, and which one is on screen. Requested, available and active
// stay three separate facts: a section the backend cannot serve yet is still listed, so the
// user can see what the card will offer once the integration provides it.
// See internal dev doc §5 "Abschnittswahl".

function requestedEntries(config, definitions) {
  if (!Array.isArray(config?.sections)) return null;
  const byKey = new Map(config.sections.map((entry) => [entry.type, entry]));
  return definitions.filter((definition) => byKey.has(definition.key)).map((definition) => ({ definition, request: byKey.get(definition.key) }));
}

function automaticEntries(definitions, model) {
  return definitions.map((definition) => ({ definition, request: null })).filter(({ definition }) => definition.defaultEnabled(model) !== false);
}

export function buildTabs({ sectionDefinitions = [], model = {}, config = {}, ui = {}, texts = { t: (key) => key } } = {}) {
  const explicit = requestedEntries(config, sectionDefinitions);
  const entries = explicit ?? automaticEntries(sectionDefinitions, model);
  const showUnavailable = config.show?.unavailable_sections !== false;

  const candidates = entries
    .map(({ definition, request }) => {
      const available = (definition.requires || []).every((capability) => model.capabilities?.[capability] === true);
      const requested = request ? request.enabled !== false : true;
      const auto = request ? request.enabled === "auto" : true;
      const enabled = auto ? definition.defaultEnabled(model) !== false : requested;
      return {
        key: definition.key,
        label: texts.t(`section.${definition.key}`),
        shortLabel: texts.t(`section.short.${definition.key}`),
        capability: (definition.requires || [])[0] || null,
        available,
        enabled,
        degraded: enabled && !available,
      };
    })
    .filter((tab) => tab.enabled && (tab.available || showUnavailable));

  const preferred = ui.section && candidates.some((tab) => tab.key === ui.section) ? ui.section : null;
  const start = config.start_section && candidates.some((tab) => tab.key === config.start_section) ? config.start_section : null;
  const active = preferred || start || candidates.find((tab) => tab.available)?.key || candidates[0]?.key || null;

  return {
    tabs: candidates.map((tab) => ({ ...tab, active: tab.key === active })),
    active,
    // `auto` hides a tab strip that would offer no choice.
    visible: config.show?.tabs === false ? false : config.show?.tabs === true ? candidates.length > 0 : candidates.length > 1,
  };
}
