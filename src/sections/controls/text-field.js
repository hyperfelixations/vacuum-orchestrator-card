// Native text/textarea control with a stable data path for the card runtime.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

function multiline(field) {
  return field.multiline === true || field.path === "note";
}

function described(field) {
  return field.error ? ` aria-describedby="${fieldId(field.path)}-error"` : "";
}

export const textField = {
  render(_context, field) {
    const value = field.value === null || field.value === undefined ? "" : String(field.value);
    const common = `class="voc-text-input" data-control="text-field" data-action="update-draft" data-field-path="${escapeHtml(field.path)}" aria-labelledby="${fieldId(field.path)}-label" aria-invalid="${field.error ? "true" : "false"}"${described(field)}`;
    if (multiline(field)) return `<textarea ${common} rows="3">${escapeHtml(value)}</textarea>`;
    return `<input ${common} type="text" value="${escapeHtml(value)}" autocomplete="off">`;
  },

  patch(_context, node, field) {
    if (!node) return;
    const value = field.value === null || field.value === undefined ? "" : String(field.value);
    if (node.value !== value) node.value = value;
    node.setAttribute("aria-invalid", field.error ? "true" : "false");
  },

  focus(node) {
    if (node && typeof node.focus === "function") node.focus();
  },
};

export default textField;
