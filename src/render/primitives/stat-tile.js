import { escapeHtml } from "../../core/text.js";

export function statTileMarkup({ label, value, key = "" } = {}) {
  return `<div class="voc-stat-tile" data-stat="${escapeHtml(key)}"><span class="voc-stat-value">${escapeHtml(value)}</span><span class="voc-stat-label">${escapeHtml(label)}</span></div>`;
}

export function renderStatTile(context, options) {
  return context.htmlToElement(statTileMarkup(options));
}
