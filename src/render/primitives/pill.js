import { escapeHtml } from "../../core/text.js";

export function pillMarkup({ label, tone = "idle", className = "" } = {}) {
  return `<span class="voc-pill voc-pill--${escapeHtml(tone)} ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

export function renderPill(context, options) {
  return context.htmlToElement(pillMarkup(options));
}
