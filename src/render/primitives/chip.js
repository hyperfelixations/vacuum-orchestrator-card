import { escapeHtml } from "../../core/text.js";

export function chipMarkup({ label, value = "", selected = false, disabled = false, action = "" } = {}) {
  return `<button type="button" class="voc-chip" data-action="${escapeHtml(action)}" aria-pressed="${selected ? "true" : "false"}"${disabled ? " disabled" : ""}><span>${escapeHtml(label)}</span>${value ? `<span class="voc-chip-value">${escapeHtml(value)}</span>` : ""}</button>`;
}

export function renderChip(context, options) {
  return context.htmlToElement(chipMarkup(options));
}
