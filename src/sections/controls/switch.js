// A small card-owned switch used for read-only area release status when the backend exposes it.

import { escapeHtml } from "../../core/text.js";
import { fieldId } from "../../presentation/sections/helpers.js";

export const switchControl = {
  render(_context, field) {
    const checked = field.checked === true || field.value === true;
    const disabled = field.disabled === true || field.readOnly === true;
    return `<button type="button" class="voc-control voc-switch${checked ? " is-checked" : ""}" data-control="switch" data-action="update-draft" data-field-path="${escapeHtml(field.path)}" role="switch" aria-checked="${checked}" aria-labelledby="${fieldId(field.path)}-label"${disabled ? ' aria-disabled="true"' : ""}${field.error ? ` aria-describedby="${fieldId(field.path)}-error" aria-invalid="true"` : ""}><span class="voc-switch-thumb" aria-hidden="true"></span></button>`;
  },

  patch(_context, node, field) {
    if (!node) return;
    const checked = field.checked === true || field.value === true;
    node.classList.toggle("is-checked", checked);
    node.setAttribute("aria-checked", String(checked));
    if (field.disabled || field.readOnly) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
  },

  focus(node) {
    if (node && typeof node.focus === "function") node.focus();
  },
};

export default switchControl;
