// A menu button with its menu (WAI-ARIA APG "Menu Button"): `⋯` beside the object it acts on,
// the menu only while open. Items stay focusable when unavailable and say why (`aria-disabled`,
// title). Opening, closing, arrow keys and placement belong to the element and its runtimes; see
// internal dev doc §9 "Menüs".

import { argsAttr, e, icon } from "../../render/primitives/markup.js";

const safe = (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, "-");

export const menuId = (key) => `voc-menu-${safe(key)}`;

// `items`: { action, args, label, iconName, decision, reasonText, tone }; a hidden decision is left
// out; `tone: "danger"` marks a destructive item.
export function menu(context, { key, label, items, open }) {
  const shown = items.filter((item) => item.decision?.state !== "hidden");
  if (!shown.length) return "";
  const id = menuId(key);
  const entries = shown
    .map((item) => {
      const off = item.decision?.state === "disabled";
      return `<button type="button" role="menuitem" tabindex="-1" class="voc-menu-item"${item.tone ? ` data-tone="${e(item.tone)}"` : ""} data-action="${e(item.action)}"${argsAttr(item.args)}${off ? ` aria-disabled="true"${item.reasonText ? ` title="${e(item.reasonText)}"` : ""}` : ""}>${icon(item.iconName)}<span>${e(item.label)}</span></button>`;
    })
    .join("");
  const list = open ? `<div class="voc-menu" role="menu" id="${id}" aria-label="${e(label)}">${entries}</div>` : "";
  return `<div class="voc-menu-anchor" data-key="menu:${e(key)}"><button type="button" class="voc-button voc-button--icon voc-menu-button" data-action="toggle-menu"${argsAttr({ key })} aria-haspopup="menu" aria-expanded="${open ? "true" : "false"}"${open ? ` aria-controls="${id}"` : ""} aria-label="${e(label)}" title="${e(label)}">${icon("mdi:dots-horizontal")}</button>${list}</div>`;
}
