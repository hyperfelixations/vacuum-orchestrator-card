// Entity picker: native input plus a deterministic listbox and selected chips.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

function options(field) {
  return Array.isArray(field.options) ? field.options : [];
}

function optionValue(option) {
  return option && typeof option === "object" ? option.value : option;
}

function optionLabel(option) {
  return option && typeof option === "object" ? option.label ?? option.value : option;
}

function values(field) {
  return new Set((Array.isArray(field.value) ? field.value : field.value ? [field.value] : []).map((value) => String(value)));
}

function optionMarkup(field) {
  const selected = values(field);
  return options(field)
    .map((option, index) => {
      const value = String(optionValue(option) ?? "");
      return `<button type="button" hidden class="voc-combobox-option${selected.has(value) ? " is-selected" : ""}" role="option" aria-selected="${selected.has(value)}" id="${fieldId(field.path)}-option-${index}" data-action="update-draft" data-voc-value="${escapeHtml(value)}" data-field-path="${escapeHtml(field.path)}">${escapeHtml(optionLabel(option) ?? "")}</button>`;
    })
    .join("");
}

function chipsMarkup(field, context) {
  const removeLabel = context?.texts?.t?.("action.dismiss") || "Remove";
  return [...values(field)]
    .map((value) => `<span class="voc-combobox-chip" data-selected-value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span><button type="button" class="voc-combobox-chip-remove" data-action="update-draft" data-combobox-remove="${escapeHtml(value)}" data-field-path="${escapeHtml(field.path)}" aria-label="${escapeHtml(removeLabel)}">×</button></span>`)
    .join("");
}

// Narrows the option list to entries whose label or id contains the query. Pure DOM on the
// control's own node: filtering is presentation, not draft state, and must not re-render.
export function filterEntityOptions(node, query) {
  const needle = String(query || "").trim().toLowerCase();
  const list = node?.querySelector?.(".voc-combobox-list");
  if (!list) return 0;
  let visible = 0;
  for (const option of list.querySelectorAll("[role='option']")) {
    const match = needle !== "" && `${option.textContent} ${option.dataset.vocValue}`.toLowerCase().includes(needle);
    option.hidden = !match;
    if (match) visible += 1;
  }
  const expanded = visible > 0;
  list.hidden = !expanded;
  node.setAttribute("aria-expanded", String(expanded));
  node.querySelector(".voc-combobox-input")?.setAttribute("aria-expanded", String(expanded));
  return visible;
}

export const entityCombobox = {
  render(context, field) {
    const id = fieldId(field.path);
    const expanded = field.expanded === true;
    return `<div class="voc-control voc-entity-combobox" data-control="entity-combobox" data-field-path="${escapeHtml(field.path)}" aria-haspopup="listbox" aria-expanded="${expanded}" aria-owns="${id}-listbox" aria-labelledby="${id}-label" aria-invalid="${field.error ? "true" : "false"}"${field.error ? ` aria-describedby="${id}-error"` : ""}>
      <div class="voc-combobox-chips">${chipsMarkup(field, context)}</div>
      <input class="voc-combobox-input" data-action="update-draft" data-voc-input="entity" data-field-path="${escapeHtml(field.path)}" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="${expanded}" aria-controls="${id}-listbox" aria-activedescendant="${escapeHtml(field.activeDescendant || "")}" value="${escapeHtml(field.query || "")}" aria-label="${escapeHtml(field.label || field.path)}">
      <div class="voc-combobox-list" id="${id}-listbox" role="listbox"${expanded ? "" : " hidden"}>${optionMarkup(field)}</div>
    </div>`;
  },

  patch(context, node, field) {
    if (!node) return;
    node.setAttribute("aria-expanded", String(field.expanded === true));
    node.setAttribute("aria-invalid", field.error ? "true" : "false");
    // The chosen entities are the control's only visible answer, so a value change has to
    // reach them without waiting for a full render.
    const chips = node.querySelector(".voc-combobox-chips");
    if (chips) chips.innerHTML = chipsMarkup(field, context);
    const selected = values(field);
    for (const option of node.querySelectorAll("[role='option']")) {
      const isSelected = selected.has(String(option.dataset.vocValue ?? ""));
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", String(isSelected));
    }
    const input = node.querySelector(".voc-combobox-input");
    if (input) {
      input.value = field.query || "";
      input.setAttribute("aria-expanded", String(field.expanded === true));
      input.setAttribute("aria-activedescendant", field.activeDescendant || "");
    }
    const list = node.querySelector(".voc-combobox-list");
    if (list) list.hidden = field.expanded !== true;
  },

  focus(node) {
    const target = node?.querySelector(".voc-combobox-input") || node;
    if (target && typeof target.focus === "function") target.focus();
  },
};

export default entityCombobox;
