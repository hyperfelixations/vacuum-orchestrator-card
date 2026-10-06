// Form fields for editors and dialogs. A field view model names its draft field; choices send
// `set-field` / `toggle-value` / `step-field` actions, text and number inputs report through
// `data-field`. Label, hint and error are tied to the control with ARIA ids.
// See internal dev doc §9 "Formularfelder".

import { argsAttr, attr, button, e, icon } from "../../render/primitives/markup.js";

export function fieldId(key) {
  return `voc-field-${String(key || "field").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function describedBy(field) {
  const id = fieldId(field.key);
  return [field.hint ? `${id}-hint` : null, field.error ? `${id}-error` : null].filter(Boolean).join(" ") || null;
}

function choice(field, option, { role, selected, multiple }) {
  const action = multiple ? "toggle-value" : "set-field";
  const disabled = option.disabled === true;
  return `<button type="button" class="voc-option${selected ? " is-selected" : ""}${option.muted ? " is-muted" : ""}" role="${role}" ${role === "radio" ? "aria-checked" : "aria-selected"}="${selected}" tabindex="${selected ? 0 : -1}" data-action="${action}"${argsAttr({ field: field.key, value: option.value })} data-value="${e(option.value ?? "")}" data-key="option:${e(option.value ?? "")}"${disabled ? ' aria-disabled="true"' : ""}${attr("title", option.title || null)}>${icon(option.icon)}<span>${e(option.label)}</span>${option.badge ? `<span class="voc-option-badge">${icon(option.badge)}</span>` : ""}</button>`;
}

function roving(markup) {
  // Exactly one option is reachable by Tab: the selected one, else the first.
  return markup.includes('tabindex="0"') ? markup : markup.replace('tabindex="-1"', 'tabindex="0"');
}

function segmented(field) {
  const items = field.options.map((option) => choice(field, option, { role: "radio", selected: option.value === field.value })).join("");
  return roving(`<div class="voc-segmented" role="radiogroup" aria-labelledby="${fieldId(field.key)}-label"${attr("aria-describedby", describedBy(field))}${field.error ? ' aria-invalid="true"' : ""} data-control="choice">${items}</div>`);
}

// A vertical single choice whose options explain themselves: a radio mark, a label and a note.
function radios(field) {
  const items = field.options
    .map((option) => {
      const selected = option.value === field.value;
      return `<button type="button" class="voc-radio${selected ? " is-selected" : ""}" role="radio" aria-checked="${selected}" tabindex="${selected ? 0 : -1}" data-action="set-field"${argsAttr({ field: field.key, value: option.value })} data-value="${e(option.value)}" data-key="option:${e(option.value)}">${icon(selected ? "mdi:radiobox-marked" : "mdi:radiobox-blank")}<span class="voc-radio-text"><span class="voc-radio-label">${e(option.label)}</span>${option.description ? `<span class="voc-radio-note">${e(option.description)}</span>` : ""}</span></button>`;
    })
    .join("");
  return roving(`<div class="voc-radios" role="radiogroup" aria-labelledby="${fieldId(field.key)}-label"${attr("aria-describedby", describedBy(field))} data-control="choice">${items}</div>`);
}

function chips(field) {
  const selected = new Set(field.value || []);
  const items = field.options.map((option) => choice(field, option, { role: "option", selected: selected.has(option.value), multiple: true })).join("");
  return roving(`<div class="voc-chips" role="listbox" aria-multiselectable="true" aria-labelledby="${fieldId(field.key)}-label"${attr("aria-describedby", describedBy(field))}${field.error ? ' aria-invalid="true"' : ""} data-control="choice">${items}</div>`);
}

function stepper(context, field) {
  const value = Number.isFinite(field.value) ? field.value : field.min;
  const step = (direction) => button({ action: "step-field", args: { field: field.key, step: direction, min: field.min, max: field.max }, label: context.t(direction < 0 ? "field.decrease" : "field.increase"), iconName: direction < 0 ? "mdi:minus" : "mdi:plus", variant: "icon", decision: (direction < 0 ? value <= field.min : value >= field.max) ? { state: "disabled", reason: "at_boundary" } : null });
  return `<div class="voc-stepper" role="group" aria-labelledby="${fieldId(field.key)}-label">${step(-1)}<input class="voc-input voc-stepper-input" type="number" inputmode="numeric" id="${fieldId(field.key)}" data-field="${e(field.key)}" min="${field.min}" max="${field.max}" step="1" value="${e(value)}"${attr("aria-describedby", describedBy(field))}${field.error ? ' aria-invalid="true"' : ""}>${step(1)}</div>`;
}

function text(field, multiline = false) {
  const common = `class="voc-input" id="${fieldId(field.key)}" data-field="${e(field.key)}"${attr("placeholder", field.placeholder || null)}${attr("aria-describedby", describedBy(field))}${field.error ? ' aria-invalid="true"' : ""}${field.required ? " required" : ""}`;
  if (multiline) return `<textarea ${common} rows="3">${e(field.value ?? "")}</textarea>`;
  return `<input ${common} type="${field.inputType || "text"}"${field.inputType === "number" ? `${attr("min", field.min)}${attr("max", field.max)}${attr("step", field.step)}` : ""} value="${e(field.value ?? "")}" autocomplete="off">`;
}

function toggle(field) {
  const checked = field.value === true;
  return `<label class="voc-switch"><input type="checkbox" role="switch" id="${fieldId(field.key)}" data-field="${e(field.key)}"${checked ? " checked" : ""}${attr("aria-describedby", describedBy(field))}><span class="voc-switch-track" aria-hidden="true"><span class="voc-switch-thumb"></span></span><span class="voc-switch-label">${e(field.switchLabel || "")}</span></label>`;
}

// Selected entities as removable chips, a search field and the matches for its query.
function entities(context, field) {
  const selected = (field.value || [])
    .map((entry) => `<span class="voc-entity-chip" data-key="selected:${e(entry.value)}"><span>${e(entry.label)}</span>${button({ action: "toggle-value", args: { field: field.key, value: entry.value }, label: context.t("field.remove", { item: entry.label }), iconName: "mdi:close", variant: "icon", className: "voc-entity-remove" })}</span>`)
    .join("");
  const matches = (field.matches || [])
    .map((entry) => `<button type="button" class="voc-entity-match" role="option" aria-selected="false" data-action="toggle-value"${argsAttr({ field: field.key, value: entry.value })} data-key="match:${e(entry.value)}"><span class="voc-entity-name">${e(entry.label)}</span><span class="voc-entity-id">${e(entry.value)}</span></button>`)
    .join("");
  // A single-entity field offers its search only while nothing is chosen.
  if (field.single && selected) return `<div class="voc-entities" data-control="entities"><div class="voc-entity-chips">${selected}</div></div>`;
  return `<div class="voc-entities" data-control="entities">${selected ? `<div class="voc-entity-chips">${selected}</div>` : ""}<input class="voc-input" type="search" id="${fieldId(field.key)}" data-field="${e(field.queryKey)}" value="${e(field.query || "")}" placeholder="${e(context.t("field.searchEntities"))}" autocomplete="off" role="combobox" aria-expanded="${matches ? "true" : "false"}" aria-controls="${fieldId(field.key)}-matches"${attr("aria-describedby", describedBy(field))}>${matches ? `<div class="voc-entity-matches" id="${fieldId(field.key)}-matches" role="listbox" aria-label="${e(field.label)}">${matches}</div>` : ""}</div>`;
}

const RENDERERS = Object.freeze({
  segmented: (_context, field) => segmented(field),
  radios: (_context, field) => radios(field),
  chips: (_context, field) => chips(field),
  stepper: (context, field) => stepper(context, field),
  text: (_context, field) => text(field),
  textarea: (_context, field) => text(field, true),
  switch: (_context, field) => toggle(field),
  entities: (context, field) => entities(context, field),
});

export function renderField(context, field) {
  if (!field || field.hidden) return "";
  const id = fieldId(field.key);
  const control = (RENDERERS[field.control] || RENDERERS.text)(context, field);
  // Inputs take a <label for>; choice groups are named through aria-labelledby.
  const labelTag = ["text", "textarea", "stepper", "switch", "entities"].includes(field.control) ? "label" : "div";
  const optional = field.optionalLabel ? ` <span class="voc-field-optional">${e(field.optionalLabel)}</span>` : "";
  const label = `<${labelTag} class="voc-field-label${field.labelHidden ? " voc-sr-only" : ""}" id="${id}-label"${labelTag === "label" ? ` for="${id}"` : ""}>${e(field.label)}${optional}</${labelTag}>`;
  const hint = field.hint ? `<div class="voc-field-hint" id="${id}-hint">${e(field.hint)}</div>` : "";
  const error = field.error ? `<div class="voc-field-error" id="${id}-error" role="alert">${e(field.error)}</div>` : "";
  // Inline: label and hint beside the control, which wraps below them when space runs out.
  if (field.layout === "inline") return `<div class="voc-field voc-field--inline${field.error ? " is-invalid" : ""}" data-key="field:${e(field.key)}" data-field-control="${e(field.control)}"><div class="voc-field-text">${label}${hint}</div>${control}${error}</div>`;
  return `<div class="voc-field${field.error ? " is-invalid" : ""}" data-key="field:${e(field.key)}" data-field-control="${e(field.control)}">${label}${control}${hint}${error}</div>`;
}
