// Keyboard-oriented single-choice control. The runtime consumes data-voc-value on key/click.

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

function valueEquals(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function aria(field) {
  return `${field.error ? ' aria-invalid="true"' : ' aria-invalid="false"'} aria-labelledby="${fieldId(field.path)}-label"${field.error ? ` aria-describedby="${fieldId(field.path)}-error"` : ""}`;
}

export const segmented = {
  render(_context, field) {
    const items = options(field)
      .map((option, index) => {
        const value = valueOf(option);
        const selected = valueEquals(field.value, value);
        return `<button type="button" class="voc-segmented-option${selected ? " is-selected" : ""}" role="radio" aria-checked="${selected}" tabindex="${selected || (!field.value && index === 0) ? "0" : "-1"}" data-action="update-draft" data-voc-value="${escapeHtml(value ?? "")}" data-field-path="${escapeHtml(field.path)}">${escapeHtml(labelOf(option) ?? "")}</button>`;
      })
      .join("");
    return `<div class="voc-control voc-segmented" data-control="segmented" data-field-path="${escapeHtml(field.path)}" role="radiogroup"${aria(field)}>${items}</div>`;
  },

  patch(_context, node, field) {
    if (!node) return;
    node.setAttribute("aria-invalid", field.error ? "true" : "false");
    const values = new Set(options(field).map((option) => String(valueOf(option) ?? "")));
    for (const button of node.querySelectorAll("[data-voc-value]")) {
      const selected = valueEquals(field.value, button.getAttribute("data-voc-value"));
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected || (!values.has(String(field.value ?? "")) && button === node.querySelector("[data-voc-value]")) ? 0 : -1;
    }
  },

  focus(node) {
    const target = node?.querySelector('[aria-checked="true"]') || node?.querySelector("button");
    if (target && typeof target.focus === "function") target.focus();
  },
};

export default segmented;
