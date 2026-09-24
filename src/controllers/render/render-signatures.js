// What makes a render necessary. Every input that can change visible content belongs in the
// data signature; every input that adds or removes nodes belongs in the structural one.
// See internal dev doc §5 "Render-Signaturen".
//
// Deliberately left out: `model.entities`. Home Assistant updates states constantly, and the
// card uses entity names only as labels in the editor and the detail page.

// `nowMs` enters as a minute bucket so relative time labels move on with the next hass update
// rather than on every one.
export function dataSignature({ model = {}, config = {}, language = "en", surface = "", ui = {}, nowMs = 0 } = {}) {
  return JSON.stringify({
    minute: config.time_format === "absolute" ? 0 : Math.floor(nowMs / 60000),
    connection: model.connection,
    permissions: model.permissions,
    capabilities: model.capabilities,
    queue: model.queue,
    active: model.active,
    history: model.history,
    attention: model.attention,
    robots: model.robots,
    areas: model.areas,
    commands: model.commands,
    lastCommandError: model.lastCommandError,
    diagnostics: model.diagnostics,
    language,
    surface,
    section: ui.section,
    overlay: ui.overlay,
    draft: ui.draft,
    pageSize: config.page_size,
  });
}

export function structuralConfigSignature(config = {}) {
  return JSON.stringify({
    title: config.title,
    subtitle: config.subtitle,
    icon: config.icon,
    accent_line: config.accent_line,
    show: config.show,
    sections: config.sections,
    start_section: config.start_section,
    density: config.density,
    time_format: config.time_format,
    confirm_destructive: config.confirm_destructive,
  });
}
