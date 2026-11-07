// What a render shows, as one string: a render with the same signature shows the same card, so
// the render controller skips it. Everything a view model reads belongs here; see internal dev
// doc §9 "Render-Controller".

export function renderSignature({ sessionVersion = null, configVersion, language, scheme, nowMs, clockMode, ui, model }) {
  return JSON.stringify({
    session: sessionVersion,
    config: configVersion,
    language,
    scheme,
    minute: Math.floor(nowMs / 60000),
    second: clockMode === "second" ? Math.floor(nowMs / 1000) : null,
    ui,
    // An editor's entity search shows ids and names, so a renamed entity is a change.
    hass: [model.robotsLive, model.entityReadings, model.areas, model.operations, model.permissions, model.entityCatalog.map(({ entityId, name }) => [entityId, name])],
  });
}
