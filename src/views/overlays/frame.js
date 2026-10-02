// The page frame every overlay shares: a back control, a heading, an optional status, the content
// and a closing action row. A dialog frame adds the dialog role, so focus stays inside it.

import { button, e } from "../../render/primitives/markup.js";

export function frame(context, { key, title, status = "", lead = "", content = "", actions = "", dialog = false }) {
  const role = dialog ? ' role="dialog" aria-modal="true"' : ' role="region"';
  return `<section class="voc-overlay" data-key="overlay:${e(key)}"${role} aria-labelledby="voc-overlay-title">${`<header class="voc-overlay-head">${button({ action: "back", label: context.t("action.back"), iconName: "mdi:arrow-left", variant: "icon", className: "voc-back" })}<h2 class="voc-overlay-title" id="voc-overlay-title" tabindex="-1">${e(title)}</h2>${status}</header>`}${lead ? `<p class="voc-overlay-lead">${e(lead)}</p>` : ""}${content}${actions ? `<div class="voc-overlay-actions">${actions}</div>` : ""}</section>`;
}

export function block(title, content, { iconName = null, key = null } = {}) {
  if (!content) return "";
  return `<section class="voc-block"${key ? ` data-key="${e(key)}"` : ""}><h3 class="voc-block-title">${iconName ? `<ha-icon icon="${e(iconName)}" aria-hidden="true"></ha-icon>` : ""}${e(title)}</h3>${content}</section>`;
}
