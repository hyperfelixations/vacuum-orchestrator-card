// Accessible field wrapper shared by the card's own controls.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

function fieldLabel(field) {
  const optional = field.optionalLabel ? ` <span class="voc-field-optional">${escapeHtml(field.optionalLabel)}</span>` : "";
  return `${escapeHtml(field.label || field.path || "")} ${optional}`;
}

function describedBy(field) {
  const ids = [];
  if (field.hint) ids.push(`${fieldId(field.path)}-hint`);
  if (field.error) ids.push(`${fieldId(field.path)}-error`);
  return ids.join(" ");
}

export function renderFormField(field, controlMarkup = "") {
  const id = fieldId(field.path);
  const described = describedBy(field);
  const hint = field.hint
    ? `<div class="voc-field-hint" id="${id}-hint">${escapeHtml(field.hint.text || field.hint.label || "")}</div>`
    : "";
  const error = field.error
    ? `<div class="voc-field-error" id="${id}-error" role="alert">${escapeHtml(field.error)}</div>`
    : "";
  return `<div class="voc-form-field${field.error ? " voc-form-field-invalid" : ""}" data-field-path="${escapeHtml(field.path)}">
    <div class="voc-field-label${field.labelHidden ? " voc-sr-only" : ""}" id="${id}-label">${fieldLabel(field)}</div>
    <div class="voc-field-control"${described ? ` aria-describedby="${escapeHtml(described)}"` : ""}>${controlMarkup}</div>
    ${hint}${error}
  </div>`;
}

export const formField = {
  render(_context, field) {
    return renderFormField(field, field.controlMarkup || "");
  },

  patch(_context, node, field) {
    if (!node) return;
    node.classList.toggle("voc-form-field-invalid", Boolean(field.error));
    const label = node.querySelector(".voc-field-label");
    if (label) label.textContent = field.label || field.path || "";
    const error = node.querySelector(".voc-field-error");
    if (error) {
      error.textContent = field.error || "";
      error.hidden = !field.error;
    }
  },

  focus(node) {
    const target = node?.querySelector("input, textarea, button, [tabindex='0']");
    if (target && typeof target.focus === "function") target.focus();
  },
};

export default formField;
