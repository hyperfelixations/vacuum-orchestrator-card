// The page frame every page overlay shares: a back control, a heading, an optional status, the
// content and a closing action row, as a named region. Every page ends in the same footer (LAY-19):
// a page without actions of its own gets one that leads back. Lead, the integration's verdict on
// a rejected input (`invalid`) and content form the region that scrolls when the card has a fixed
// height. Short questions are card dialogs instead (`dialog.js`).

import { button, e, icon } from "../../render/primitives/markup.js";

// The integration's verdict on a rejected input, above the fields.
export function invalidNotice(invalid) {
  return invalid ? `<div class="voc-notice voc-notice--error" role="alert" data-key="invalid">${icon("mdi:alert-circle-outline")}<span class="voc-notice-text">${e(invalid)}</span></div>` : "";
}

export function frame(context, { key, title, status = "", lead = "", invalid = null, content = "", actions = "" }) {
  const notice = invalidNotice(invalid);
  const footer = actions || button({ action: "back", label: context.t("action.back"), variant: "quiet" });
  return `<section class="voc-overlay" data-key="overlay:${e(key)}" role="region" aria-labelledby="voc-overlay-title">${`<header class="voc-overlay-head">${button({ action: "back", label: context.t("action.back"), iconName: "mdi:arrow-left", variant: "icon", className: "voc-back" })}<h2 class="voc-overlay-title" id="voc-overlay-title" tabindex="-1">${e(title)}</h2>${status}</header>`}${lead || notice || content ? `<div class="voc-overlay-scroll" data-scroll>${lead ? `<p class="voc-overlay-lead">${e(lead)}</p>` : ""}${notice}${content}</div>` : ""}<div class="voc-overlay-actions">${footer}</div></section>`;
}

export function block(title, content, { iconName = null, key = null } = {}) {
  if (!content) return "";
  return `<section class="voc-block"${key ? ` data-key="${e(key)}"` : ""}><h3 class="voc-block-title">${iconName ? `<ha-icon icon="${e(iconName)}" aria-hidden="true"></ha-icon>` : ""}${e(title)}</h3>${content}</section>`;
}
