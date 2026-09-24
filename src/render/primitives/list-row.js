import { escapeHtml } from "../../core/text.js";

export function listRowMarkup({ key = "", title = "", subtitle = "", content = "" } = {}) {
  return `<div class="voc-list-row" data-key="${escapeHtml(key)}"><div class="voc-list-row-main"><div class="voc-list-row-title">${escapeHtml(title)}</div>${subtitle ? `<div class="voc-list-row-subtitle">${escapeHtml(subtitle)}</div>` : ""}</div><div class="voc-list-row-content">${escapeHtml(content)}</div></div>`;
}

export function renderListRow(context, options) {
  return context.htmlToElement(listRowMarkup(options));
}
