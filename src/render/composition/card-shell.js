// The view-agnostic card shell. Section and overlay renderers are injected, never imported:
// the composition layer must not know the registry. See internal dev doc §5 "Shell-Render".

import { escapeHtml } from "../../core/text.js";
import { buttonMarkup } from "../primitives/button.js";
import { statTileMarkup } from "../primitives/stat-tile.js";
import { pillMarkup } from "../primitives/pill.js";

function rendererFor(registry, key) {
  const renderers = Array.isArray(registry) ? registry : registry?.renderers || [];
  return renderers.find((entry) => entry.key === key) || null;
}

function attribute(name, value) {
  return value ? ` ${name}="${escapeHtml(value)}"` : "";
}

function headerParts(viewModel) {
  return ["icon", "title", "pill"].filter((key) => viewModel.header[key === "icon" ? "hasIcon" : key === "title" ? "hasTitle" : "hasPill"]).join(" ");
}

function sectionSignature(viewModel, registry) {
  const key = viewModel.body.kind === "overlay" ? viewModel.body.overlay : viewModel.body.section;
  const renderer = key ? rendererFor(registry, key) : null;
  if (!renderer || typeof renderer.structureSignature !== "function" || !viewModel.body.content) return "";
  return renderer.structureSignature(viewModel.body.content);
}

export function cardStructureSignature(viewModel, registry = []) {
  return [
    `empty:${viewModel.empty ? 1 : 0}`,
    `icon:${viewModel.header.hasIcon ? 1 : 0}`,
    `title:${viewModel.header.hasTitle ? 1 : 0}`,
    `subtitle:${viewModel.header.hasSubtitle ? 1 : 0}`,
    `pill:${viewModel.header.hasPill ? 1 : 0}`,
    `warning:${viewModel.warning.visible ? 1 : 0}`,
    `stats:${viewModel.hasStats ? 1 : 0}`,
    // Which tabs exist is structure; which one is selected is patched.
    `tabs:${viewModel.hasTabs ? viewModel.tabs.tabs.map((tab) => `${tab.key}${tab.degraded ? "~" : ""}`).join(",") : ""}`,
    `body:${viewModel.body.kind}:${viewModel.body.section || viewModel.body.overlay || ""}`,
    `accent:${viewModel.accentLine ? 1 : 0}`,
    `primary:${viewModel.controls.primary.visible ? 1 : 0}`,
    `queueControl:${viewModel.controls.queue.visible ? 1 : 0}:${viewModel.controls.queue.action}`,
    `section:${sectionSignature(viewModel, registry)}`,
  ].join("|");
}

function renderHeader(viewModel) {
  const header = viewModel.header;
  const children = [];
  if (header.hasIcon) children.push(`<div class="voc-icon-badge" aria-hidden="true"><ha-icon icon="${escapeHtml(header.icon)}"></ha-icon></div>`);
  if (header.hasTitle || header.hasSubtitle) children.push(`<div class="voc-title-block">${header.hasTitle ? `<div class="voc-title">${escapeHtml(header.title)}</div>` : ""}${header.hasSubtitle ? `<div class="voc-subtitle">${escapeHtml(header.subtitle)}</div>` : ""}</div>`);
  if (header.hasPill) children.push(pillMarkup({ label: header.statusLabel, tone: viewModel.tone, className: "voc-status-pill" }));
  if (!children.length) return "";
  return `<div class="voc-header"${attribute("data-parts", headerParts(viewModel))}>${children.join("")}</div>`;
}

function renderWarning(viewModel) {
  if (!viewModel.warning.visible) return "";
  return `<div class="voc-warning"><svg class="voc-warning-icon" viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(viewModel.warning.label)}"><path fill-rule="evenodd" d="M12 2.5 1.5 21h21zM11 9.5h2v5.5h-2zm0 7h2v2h-2z"/></svg><div class="voc-warning-text">${escapeHtml(viewModel.warning.text)}</div></div>`;
}

function renderStats(viewModel) {
  if (!viewModel.hasStats) return "";
  return `<div class="voc-stats">${viewModel.stats.map((stat) => statTileMarkup(stat)).join("")}</div>`;
}

// The section bar and the primary action share a row, but the button stays outside the
// tablist: a tablist holds tabs only.
function renderTabRow(viewModel) {
  const primary = viewModel.controls.primary;
  if (!viewModel.hasTabs && !primary.visible) return "";
  return `<div class="voc-tab-row">${renderTabs(viewModel)}${primary.visible ? buttonMarkup(primary) : ""}</div>`;
}

function renderQueueControls(viewModel) {
  const queue = viewModel.controls.queue;
  if (!queue.visible) return "";
  return `<div class="voc-queue-controls" data-queue-mode="${escapeHtml(viewModel.controls.mode)}">${buttonMarkup(queue)}</div>`;
}

function renderTabs(viewModel) {
  if (!viewModel.hasTabs) return "";
  return `<div class="voc-tabs" role="tablist">${viewModel.tabs.tabs.map((tab) => `<button type="button" class="voc-tab" role="tab" id="voc-tab-${escapeHtml(tab.key)}" data-section="${escapeHtml(tab.key)}" aria-controls="voc-panel" aria-selected="${tab.active ? "true" : "false"}" tabindex="${tab.active ? "0" : "-1"}" aria-label="${escapeHtml(tab.label)}"${tab.degraded ? ' data-degraded="true"' : ""}><span class="voc-tab-label" aria-hidden="true">${escapeHtml(tab.label)}</span><span class="voc-tab-short" aria-hidden="true">${escapeHtml(tab.shortLabel)}</span></button>`).join("")}</div>`;
}

function renderBody(context, viewModel, registry) {
  const key = viewModel.body.kind === "overlay" ? viewModel.body.overlay : viewModel.body.section;
  const renderer = key ? rendererFor(registry, key) : null;
  if (renderer && viewModel.body.content) return renderer.render(context, viewModel.body.content);
  const message = viewModel.body.message || viewModel.noSectionMessage;
  return `<div class="voc-no-section" role="status">${escapeHtml(message)}</div>`;
}

export function renderCardBody(context, viewModel, registry = []) {
  const rootAttributes = [
    `data-state="${viewModel.empty ? "empty" : "ready"}"`,
    `data-tone="${escapeHtml(viewModel.tone)}"`,
    `data-density="${escapeHtml(viewModel.density)}"`,
    attribute("data-accent-line", viewModel.accentLinePosition === "bottom" ? "bottom" : ""),
    attribute("data-title", viewModel.header.titleOverflow === "clip" ? "clip" : ""),
    attribute("data-subtitle", viewModel.header.subtitleOverflow === "wrap" ? "wrap" : ""),
    `style="${escapeHtml(viewModel.toneStyle)}"`,
  ].join(" ");
  return `<div class="voc-root" ${rootAttributes} tabindex="-1">${viewModel.accentLine ? `<div class="voc-top-line"></div>` : ""}${renderHeader(viewModel)}${renderWarning(viewModel)}${renderStats(viewModel)}${renderTabRow(viewModel)}<div class="voc-body" id="voc-panel"${viewModel.body.kind === "section" ? ' role="tabpanel"' : ""}${viewModel.body.kind === "section" && viewModel.tabs.active ? ` aria-labelledby="voc-tab-${escapeHtml(viewModel.tabs.active)}"` : ""}>${renderBody(context, viewModel, registry)}</div>${renderQueueControls(viewModel)}<div class="voc-live-region" aria-live="polite" aria-atomic="true"></div></div>`;
}

export function renderFailureBody(message) {
  return `<div class="voc-root" data-state="error" tabindex="-1"><div class="voc-render-failed">${escapeHtml(message)}</div></div>`;
}

export function patchCardBody(context, root, viewModel, registry = []) {
  const cardRoot = root?.querySelector?.(".voc-root");
  if (!cardRoot) return;
  cardRoot.setAttribute("data-state", viewModel.empty ? "empty" : "ready");
  cardRoot.setAttribute("data-tone", viewModel.tone);
  cardRoot.setAttribute("data-density", viewModel.density);
  cardRoot.setAttribute("style", viewModel.toneStyle);
  if (viewModel.accentLinePosition === "bottom") cardRoot.setAttribute("data-accent-line", "bottom");
  else cardRoot.removeAttribute("data-accent-line");
  if (viewModel.header.titleOverflow === "clip") cardRoot.setAttribute("data-title", "clip");
  else cardRoot.removeAttribute("data-title");
  if (viewModel.header.subtitleOverflow === "wrap") cardRoot.setAttribute("data-subtitle", "wrap");
  else cardRoot.removeAttribute("data-subtitle");
  const title = cardRoot.querySelector(".voc-title");
  if (title) title.textContent = viewModel.header.title;
  const subtitle = cardRoot.querySelector(".voc-subtitle");
  if (subtitle) subtitle.textContent = viewModel.header.subtitle;
  const icon = cardRoot.querySelector(".voc-icon-badge ha-icon");
  if (icon) icon.setAttribute("icon", viewModel.header.icon);
  const pill = cardRoot.querySelector(".voc-status-pill");
  if (pill) {
    pill.textContent = viewModel.header.statusLabel;
    pill.className = `voc-pill voc-pill--${viewModel.tone} voc-status-pill`;
  }
  for (const stat of viewModel.stats) {
    const value = cardRoot.querySelector(`.voc-stat-tile[data-stat="${stat.key}"] .voc-stat-value`);
    if (value) value.textContent = stat.value;
  }
  const warning = cardRoot.querySelector(".voc-warning-text");
  if (warning) warning.textContent = viewModel.warning.text;
  cardRoot.querySelectorAll('[role="tab"]').forEach((tab) => {
    const active = viewModel.tabs.tabs.find((entry) => entry.key === tab.dataset.section)?.active === true;
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });
  for (const control of [viewModel.controls.primary, viewModel.controls.queue]) {
    const button = cardRoot.querySelector(`.${control.className}`);
    if (!button) continue;
    button.disabled = control.disabled;
    if (control.ariaDisabled) button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    if (control.title) button.setAttribute("title", control.title);
    else button.removeAttribute("title");
    button.setAttribute("aria-label", control.label);
    button.dataset.action = control.action;
    const label = button.querySelector(".voc-button-label");
    if (label) label.textContent = control.label;
    const buttonIcon = button.querySelector("ha-icon");
    if (buttonIcon && control.icon) buttonIcon.setAttribute("icon", control.icon);
  }
  const controls = cardRoot.querySelector(".voc-queue-controls");
  if (controls) controls.dataset.queueMode = viewModel.controls.mode;
  const live = cardRoot.querySelector(".voc-live-region");
  if (live && viewModel.liveMessage) live.textContent = viewModel.liveMessage;
  const body = cardRoot.querySelector(".voc-body");
  const key = viewModel.body.kind === "overlay" ? viewModel.body.overlay : viewModel.body.section;
  const renderer = body && key ? rendererFor(registry, key) : null;
  if (renderer && viewModel.body.content) renderer.patch(context, body, viewModel.body.content);
}

export function resolveSectionLayouts(context, root, viewModel, registry = []) {
  if (!viewModel?.body?.content) return;
  const key = viewModel.body.kind === "overlay" ? viewModel.body.overlay : viewModel.body.section;
  const renderer = key ? rendererFor(registry, key) : null;
  renderer?.resolveLayout?.(context, root, viewModel.body.content);
}
