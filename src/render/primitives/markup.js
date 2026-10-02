// Markup building blocks shared by the shell and every view. Variable text is escaped here, at
// the boundary; commands are `data-action` plus JSON `data-args`, interpreted by the element.
// See internal dev doc §9 "Markup-Vertrag".

import { escapeHtml } from "../../core/text.js";

export const e = (value) => escapeHtml(value === null || value === undefined ? "" : String(value));

export function attr(name, value) {
  return value === null || value === undefined || value === false ? "" : value === true ? ` ${name}` : ` ${name}="${e(value)}"`;
}

export function argsAttr(args) {
  return args && Object.keys(args).length ? ` data-args="${e(JSON.stringify(args))}"` : "";
}

export function icon(name, { label = null, className = "" } = {}) {
  if (!name) return "";
  return `<ha-icon${attr("class", className || null)} icon="${e(name)}"${label ? ` aria-label="${e(label)}" role="img"` : ' aria-hidden="true"'}></ha-icon>`;
}

// Hard reasons make a control inert; a missing operation or a read-only user keeps it focusable
// so its explanation can be read.
const HARD_REASONS = new Set(["command_pending", "at_boundary", "robot_busy", "template_disabled"]);

export function decisionAttributes(decision, reasonText) {
  if (!decision || decision.state !== "disabled") return "";
  const hard = HARD_REASONS.has(decision.reason);
  return `${hard ? " disabled" : ' aria-disabled="true"'}${reasonText ? ` title="${e(reasonText)}"` : ""}`;
}

// `variant`: "icon" (icon only, label for assistive technology), "text", "primary", "danger",
// "quiet". A hidden decision renders nothing.
export function button({ action, args = null, label, iconName = null, variant = "text", decision = null, reasonText = "", className = "", extra = "", key = null, pressed = null, tooltip = false } = {}) {
  if (decision?.state === "hidden") return "";
  const classes = ["voc-button", `voc-button--${variant}`, className].filter(Boolean).join(" ");
  const content = variant === "icon" ? icon(iconName) : `${icon(iconName)}<span class="voc-button-label">${e(label)}</span>`;
  return `<button type="button" class="${classes}" data-action="${e(action)}"${argsAttr(args)}${key ? ` data-key="${e(key)}"` : ""}${variant === "icon" ? ` aria-label="${e(label)}"` : ""}${pressed === null ? "" : ` aria-pressed="${pressed}"`}${decisionAttributes(decision, reasonText)}${decision?.state === "disabled" || (variant !== "icon" && !tooltip) ? "" : ` title="${e(label)}"`}${extra}>${content}</button>`;
}

export function pill(text, tone = "neutral", { iconName = null, className = "" } = {}) {
  if (!text) return "";
  return `<span class="voc-pill voc-pill--${e(tone)}${className ? ` ${e(className)}` : ""}">${icon(iconName)}${e(text)}</span>`;
}

export function chip(text, { iconName = null, className = "", title = null } = {}) {
  if (!text) return "";
  return `<span class="voc-chip${className ? ` ${e(className)}` : ""}"${attr("title", title)}>${icon(iconName)}<span>${e(text)}</span></span>`;
}

export function link({ href, label, iconName = null }) {
  return `<a class="voc-button voc-button--primary" href="${e(href)}" target="_blank" rel="noopener noreferrer">${icon(iconName)}<span class="voc-button-label">${e(label)}</span></a>`;
}
