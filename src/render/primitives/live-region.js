import { escapeHtml } from "../../core/text.js";

export function liveRegionMarkup(text = "") {
  return `<div class="voc-live-region" aria-live="polite" aria-atomic="true">${escapeHtml(text)}</div>`;
}

export function renderLiveRegion(context, text) {
  return context.htmlToElement(liveRegionMarkup(text));
}
