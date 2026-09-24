import { escapeHtml } from "../../core/text.js";

export function iconButtonMarkup({ icon, label, action = "", disabled = false, ariaDisabled = false } = {}) {
  return `<button type="button" class="voc-icon-button" data-action="${escapeHtml(action)}" aria-label="${escapeHtml(label)}"${disabled ? " disabled" : ""}${ariaDisabled ? " aria-disabled=\"true\"" : ""}><ha-icon icon="${escapeHtml(icon || "mdi:help")}"></ha-icon></button>`;
}

export function renderIconButton(context, options) {
  return context.htmlToElement(iconButtonMarkup(options));
}
