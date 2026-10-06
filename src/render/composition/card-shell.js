// The view-agnostic card shell in RCC structure: accent line, header, warning block, main
// panel, tab row, body, live region. The body renderer is injected; the composition layer does
// not know the view registry. See internal dev doc §9 "Shell-Markup".

import { attr, button, e, icon } from "../primitives/markup.js";

const WARNING_ICON = '<path fill-rule="evenodd" d="M12 2.5 1.5 21h21zM11 9.5h2v5.5h-2zm0 7h2v2h-2z"/>';

function renderHeader(header) {
  if (!header.visible) return "";
  const parts = [];
  if (header.hasIcon) parts.push(`<div class="voc-icon-badge" aria-hidden="true">${icon(header.icon)}</div>`);
  if (header.hasTitle || header.hasSubtitle) {
    parts.push(`<div class="voc-title-block">${header.hasTitle ? `<div class="voc-title">${e(header.title)}</div>` : ""}${header.hasSubtitle ? `<div class="voc-subtitle">${e(header.subtitle)}</div>` : ""}</div>`);
  }
  if (header.hasPill) parts.push(`<div class="voc-status-pill">${e(header.pill)}</div>`);
  return `<div class="voc-header">${parts.join("")}</div>`;
}

function renderWarning(warning) {
  if (!warning.visible) return "";
  return `<div class="voc-warning"><svg class="voc-warning-icon" viewBox="0 0 24 24" role="img" aria-label="${e(warning.label)}">${WARNING_ICON}</svg><div class="voc-warning-text">${e(warning.text)}</div></div>`;
}

function renderNotice(context, notice) {
  if (!notice) return "";
  return `<div class="voc-notice voc-notice--${e(notice.kind)}" role="${notice.kind === "error" ? "alert" : "status"}">${icon(notice.kind === "error" ? "mdi:alert-circle-outline" : "mdi:check-circle-outline")}<span class="voc-notice-text">${e(notice.text)}</span>${button({ action: "dismiss-notice", label: context.t("action.dismiss"), iconName: "mdi:close", variant: "icon", className: "voc-notice-close" })}</div>`;
}

function renderPanel(context, panel) {
  if (!panel.visible) return "";
  const control = panel.control
    ? `${panel.end ? button({ action: panel.end.action, label: panel.end.label, iconName: panel.end.icon, variant: "text", decision: panel.end.decision, reasonText: context.reason(panel.end.decision), className: "voc-queue-end", tooltip: true }) : ""}${button({ action: panel.control.action, label: panel.control.label, iconName: panel.control.icon, variant: "primary", decision: panel.control.decision, reasonText: context.reason(panel.control.decision), className: "voc-queue-control", tooltip: true })}`
    : "";
  return `<div class="voc-panel" data-queue-mode="${e(panel.mode)}"><div class="voc-panel-headline"><span class="voc-panel-label">${e(panel.label)}</span><span class="voc-panel-value">${e(panel.value)}</span></div><div class="voc-panel-status"><div class="voc-panel-mode"><span class="voc-dot" aria-hidden="true"></span><span>${e(panel.runLine)}</span></div>${panel.robots?.length ? `<div class="voc-panel-robots">${panel.robots.map((robot) => `<span class="voc-panel-robot" data-key="robot:${e(robot.key)}" data-tone="${e(robot.tone)}"><span class="voc-dot" aria-hidden="true"></span>${e(robot.text)}</span>`).join("")}</div>` : ""}</div>${control ? `<div class="voc-panel-control">${control}</div>` : ""}</div>`;
}

function renderTabRow(context, vm) {
  const primary = vm.primary
    ? button({ action: vm.primary.action, label: vm.primary.label, iconName: vm.primary.icon, variant: "quiet", decision: vm.primary.decision, reasonText: context.reason(vm.primary.decision), className: "voc-primary-action", tooltip: true })
    : "";
  if (!vm.tabs.visible && !primary) return "";
  const tabs = vm.tabs.visible
    ? `<div class="voc-tabs" role="tablist" aria-label="${e(context.t("view.label"))}">${vm.tabs.tabs
        .map((tab) => `<button type="button" class="voc-tab" role="tab" id="voc-tab-${e(tab.key)}" data-key="tab-${e(tab.key)}" data-view="${e(tab.key)}" aria-controls="voc-panel" aria-selected="${tab.active}" tabindex="${tab.active ? 0 : -1}"${tab.available ? "" : ' data-unavailable="true"'} title="${e(tab.label)}">${icon(tab.icon)}<span class="voc-tab-label">${e(tab.label)}</span></button>`)
        .join("")}</div>`
    : `<div class="voc-tabs-spacer"></div>`;
  // A view without a primary action keeps its place, so the tabs look alike in every view.
  const slot = primary || (vm.tabs.visible ? '<span class="voc-primary-slot" aria-hidden="true"></span>' : "");
  return `<div class="voc-tab-row">${tabs}${slot}</div>`;
}

export function renderCard(context, vm, renderBody) {
  const header = vm.header;
  const rootAttributes = [
    `data-state="${e(vm.body.kind)}"`,
    `data-tone="${e(vm.tone)}"`,
    attr("data-parts", header.parts),
    attr("data-accent-line", vm.accentLinePosition === "bottom" ? "bottom" : null),
    attr("data-title", header.titleOverflow === "clip" ? "clip" : null),
    attr("data-subtitle", header.subtitleOverflow === "wrap" ? "wrap" : null),
    `style="${e(vm.toneStyle)}"`,
  ].join("");
  // A tab panel is a tab stop: no view starts with a focusable control, and in a frame it scrolls.
  const bodyRole = vm.body.kind === "view" && vm.tabs.visible ? ` role="tabpanel" aria-labelledby="voc-tab-${e(vm.body.key)}" tabindex="0"` : "";
  return `<div class="voc-root" ${rootAttributes} tabindex="-1">${vm.accentLine ? '<div class="voc-top-line"></div>' : ""}${renderHeader(header)}${renderWarning(vm.warning)}${renderNotice(context, vm.notice)}${renderPanel(context, vm.panel)}${renderTabRow(context, vm)}<div class="voc-body" id="voc-panel" data-body="${e(vm.body.kind)}:${e(vm.body.key || "")}" data-scroll${bodyRole}>${renderBody(context, vm.body)}</div><div class="voc-live-region" aria-live="polite" aria-atomic="true">${e(vm.liveMessage)}</div></div>`;
}

export function renderFailure(message) {
  return `<div class="voc-root" data-state="error" tabindex="-1"><div class="voc-render-failed">${e(message)}</div></div>`;
}
