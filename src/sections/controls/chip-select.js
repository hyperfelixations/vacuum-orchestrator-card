// Chip listbox for one or several choices; `data-multiple` tells the runtime which.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

function options(field) {
  return Array.isArray(field.options) ? field.options : [];
}

function valueOf(option) {
  return option && typeof option === "object" ? option.value : option;
}

function labelOf(option) {
  return option && typeof option === "object" ? option.label ?? option.value : option;
}

function selectedValues(field) {
  return new Set((Array.isArray(field.value) ? field.value : field.value === null || field.value === undefined ? [] : [field.value]).map((value) => String(value)));
}

export const chipSelect = {
  render(_context, field) {
    const selected = selectedValues(field);
    const items = options(field)
      .map((option, index) => {
        const value = valueOf(option);
        const isSelected = selected.has(String(value));
        return `<button type="button" class="voc-chip-option${isSelected ? " is-selected" : ""}" role="option" aria-selected="${isSelected}" tabindex="${isSelected || index === 0 ? "0" : "-1"}" data-action="update-draft" data-voc-value="${escapeHtml(value ?? "")}" data-field-path="${escapeHtml(field.path)}">${escapeHtml(labelOf(option) ?? "")}</button>`;
      })
      .join("");
    return `<div class="voc-control voc-chip-select" data-control="chip-select" data-field-path="${escapeHtml(field.path)}" data-multiple="${field.multiple === true}" role="listbox" aria-multiselectable="${field.multiple === true}" aria-labelledby="${fieldId(field.path)}-label" aria-invalid="${field.error ? "true" : "false"}"${field.error ? ` aria-describedby="${fieldId(field.path)}-error"` : ""}>${items}</div>`;
  },

  patch(_context, node, field) {
    if (!node) return;
    const selected = selectedValues(field);
    node.setAttribute("aria-invalid", field.error ? "true" : "false");
    for (const button of node.querySelectorAll("[data-voc-value]")) {
      const isSelected = selected.has(button.getAttribute("data-voc-value") || "");
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
    }
  },

  focus(node) {
    const target = node?.querySelector('[aria-selected="true"]') || node?.querySelector("button");
    if (target && typeof target.focus === "function") target.focus();
  },
};

export default chipSelect;
