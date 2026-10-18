// The page frame every page overlay shares: a heading (with a back arrow only where the footer has
// no way back), an optional status, the
// content and a closing action row, as a named region. Every page ends in the same footer (LAY-19):
// a page without actions of its own gets one that leads back. Lead, the integration's verdict on
// a rejected input (`invalid`) and content form the region that scrolls when the card has a fixed
// height. Short questions are card dialogs instead (`dialog.js`). While its command waits for an
// answer, every control of the page or dialog is disabled (`context.layer.busy`, UI-16).

import { button, e, icon } from "../../render/primitives/markup.js";

// The integration's verdict on a rejected input above the fields, or a dialog's failed command
// (`context.layer.failure`): a refusal, or a warning that no answer came.
export function invalidNotice(invalid, kind = "error") {
  return invalid ? `<div class="voc-notice voc-notice--${kind}" role="alert" data-key="invalid">${icon(kind === "warning" ? "mdi:alert-outline" : "mdi:alert-circle-outline")}<span class="voc-notice-text">${e(invalid)}</span></div>` : "";
}

// The layer's notice: its command's failure before the verdict on its input.
export function layerNotice(context, invalid) {
  const failure = context.layer?.failure;
  return failure ? invalidNotice(failure.text, failure.kind) : invalidNotice(invalid);
}

// The layer's controls, disabled together while its command waits; `display: contents` keeps
// the layout of the page or dialog.
export function layerControls(context, html) {
  return `<fieldset class="voc-layer" role="none"${context.layer?.busy ? " disabled" : ""}>${html}</fieldset>`;
}

export const busyAttribute = (context) => (context.layer?.busy ? ' aria-busy="true"' : "");

export function frame(context, { key, title, status = "", lead = "", invalid = null, content = "", actions = "" }) {
  const notice = layerNotice(context, invalid);
  const footer = actions || button({ action: "back", label: context.t("action.back"), variant: "quiet" });
  // A page leads back exactly once (LAY-19): from its footer where that has a way back, else from
  // the arrow beside its heading.
  const arrow = footer.includes('data-action="back"') ? "" : button({ action: "back", label: context.t("action.back"), iconName: "mdi:arrow-left", variant: "icon", className: "voc-back" });
  const head = `<header class="voc-overlay-head">${arrow}<h2 class="voc-overlay-title" id="voc-overlay-title" tabindex="-1">${e(title)}</h2>${status}</header>`;
  const body = lead || notice || content ? `<div class="voc-overlay-scroll" data-scroll>${lead ? `<p class="voc-overlay-lead">${e(lead)}</p>` : ""}${notice}${content}</div>` : "";
  return `<section class="voc-overlay" data-key="overlay:${e(key)}" role="region" aria-labelledby="voc-overlay-title"${busyAttribute(context)}>${layerControls(context, `${head}${body}<div class="voc-overlay-actions">${footer}</div>`)}</section>`;
}

// `action`: a control beside the heading, such as a section's one "Change" (LAY-08), which `id`
// lets name the section.
export function block(title, content, { iconName = null, key = null, action = "", id = null } = {}) {
  if (!content) return "";
  const heading = `<h3 class="voc-block-title"${id ? ` id="${e(id)}"` : ""}>${iconName ? `<ha-icon icon="${e(iconName)}" aria-hidden="true"></ha-icon>` : ""}${e(title)}</h3>`;
  return `<section class="voc-block"${key ? ` data-key="${e(key)}"` : ""}>${action ? `<div class="voc-block-head">${heading}${action}</div>` : heading}${content}</section>`;
}
