// Numeric stepper with explicit bounds and data-key hints for Home/End/Page controls.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

function numeric(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export const stepper = {
  render(context, field) {
    const min = numeric(field.min, 1);
    const max = numeric(field.max, 10);
    const value = numeric(field.value, min);
    const decrementLabel = field.decrementLabel || context?.texts?.t?.("action.moveDown") || "−";
    const incrementLabel = field.incrementLabel || context?.texts?.t?.("action.moveUp") || "+";
    return `<div class="voc-control voc-stepper" data-control="stepper" data-field-path="${escapeHtml(field.path)}" role="group" aria-labelledby="${fieldId(field.path)}-label" aria-invalid="${field.error ? "true" : "false"}"${field.error ? ` aria-describedby="${fieldId(field.path)}-error"` : ""}>
      <button type="button" class="voc-stepper-button" data-action="update-draft" data-stepper-action="decrement" data-field-path="${escapeHtml(field.path)}" aria-label="${escapeHtml(decrementLabel)}" data-key-action="ArrowDown PageDown Home">−</button>
      <input class="voc-stepper-input" data-action="update-draft" data-voc-input="number" data-field-path="${escapeHtml(field.path)}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${value}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${escapeHtml(field.label || field.path)}">
      <button type="button" class="voc-stepper-button" data-action="update-draft" data-stepper-action="increment" data-field-path="${escapeHtml(field.path)}" aria-label="${escapeHtml(incrementLabel)}" data-key-action="ArrowUp PageUp End">+</button>
    </div>`;
  },

  patch(_context, node, field) {
    if (!node) return;
    const input = node.querySelector("input");
    if (!input) return;
    const value = numeric(field.value, numeric(field.min, 1));
    input.value = String(value);
    input.setAttribute("aria-valuenow", String(value));
    input.setAttribute("aria-invalid", field.error ? "true" : "false");
  },

  focus(node) {
    const target = node?.querySelector("input") || node?.querySelector("button");
    if (target && typeof target.focus === "function") target.focus();
  },
};

export default stepper;
