// The view-agnostic card shell in RCC structure: accent line, header, warning block, main
// panel, tab row, body, live region, and a card dialog on a scrim above them all. The body
// renderer is injected; the composition layer does not know the view registry. See internal dev
// doc §9 "Shell-Markup".

import { attr, button, e, icon } from "../primitives/markup.js";

const WARNING_ICON = '<path fill-rule="evenodd" d="M12 2.5 1.5 21h21zM11 9.5h2v5.5h-2zm0 7h2v2h-2z"/>';

function primaryButton(context, vm) {
  return vm.primary ? button({ action: vm.primary.action, label: vm.primary.label, iconName: vm.primary.icon, variant: "quiet", decision: vm.primary.decision, reasonText: context.reason(vm.primary.decision), className: "voc-primary-action", tooltip: true }) : "";
}

// Without tabs a visible header carries the primary action; otherwise the tab row does.
const actionInHeader = (vm) => !vm.tabs.visible && vm.header.visible;

function renderHeader(context, vm) {
  const header = vm.header;
  if (!header.visible) return "";
  const parts = [];
  if (header.hasIcon) parts.push(`<div class="voc-icon-badge" aria-hidden="true">${icon(header.icon)}</div>`);
  if (header.hasTitle || header.hasSubtitle) {
    parts.push(`<div class="voc-title-block">${header.hasTitle ? `<div class="voc-title">${e(header.title)}</div>` : ""}${header.hasSubtitle ? `<div class="voc-subtitle">${e(header.subtitle)}</div>` : ""}</div>`);
  }
  if (header.hasPill) parts.push(`<div class="voc-status-pill">${e(header.pill)}</div>`);
  const action = actionInHeader(vm) ? primaryButton(context, vm) : "";
  if (action) parts.push(`<div class="voc-header-action">${action}</div>`);
  return `<div class="voc-header">${parts.join("")}</div>`;
}

function renderWarning(warning) {
  if (!warning.visible) return "";
  return `<div class="voc-warning"><svg class="voc-warning-icon" viewBox="0 0 24 24" role="img" aria-label="${e(warning.label)}">${WARNING_ICON}</svg><div class="voc-warning-text">${e(warning.text)}</div></div>`;
}

const NOTICE_ICONS = Object.freeze({ error: "mdi:alert-circle-outline", warning: "mdi:alert-outline", success: "mdi:check-circle-outline", info: "mdi:information-outline" });

function renderNotice(context, notice) {
  if (!notice) return "";
  return `<div class="voc-notice voc-notice--float voc-notice--${e(notice.kind)}" role="${notice.kind === "success" || notice.kind === "info" ? "status" : "alert"}">${icon(NOTICE_ICONS[notice.kind] ?? NOTICE_ICONS.success)}<span class="voc-notice-text">${e(notice.text)}</span>${button({ action: "dismiss-notice", label: context.t("action.dismiss"), iconName: "mdi:close", variant: "icon", className: "voc-notice-close" })}</div>`;
}

function renderPanel(context, panel) {
  if (!panel.visible) return "";
  const control = panel.control
    ? `${panel.end ? button({ action: panel.end.action, label: panel.end.label, iconName: panel.end.icon, variant: "text", decision: panel.end.decision, reasonText: context.reason(panel.end.decision), className: "voc-queue-end", tooltip: true }) : ""}${button({ action: panel.control.action, label: panel.control.label, iconName: panel.control.icon, variant: panel.control.primary ? "primary" : "text", decision: panel.control.decision, reasonText: context.reason(panel.control.decision), className: "voc-queue-control", tooltip: true })}`
    : "";
  return `<div class="voc-panel" data-queue-mode="${e(panel.mode)}"><div class="voc-panel-headline"><span class="voc-panel-label">${e(panel.label)}</span><span class="voc-panel-value">${e(panel.value)}</span></div><div class="voc-panel-status"><div class="voc-panel-mode"><span class="voc-dot" aria-hidden="true"></span><span>${e(panel.runLine)}</span></div>${panel.robots?.length ? `<div class="voc-panel-robots">${panel.robots.map((robot) => `<span class="voc-panel-robot" data-key="robot:${e(robot.key)}" data-tone="${e(robot.tone)}"><span class="voc-dot" aria-hidden="true"></span>${e(robot.text)}</span>`).join("")}</div>` : ""}</div>${control ? `<div class="voc-panel-control">${control}</div>` : ""}</div>`;
}

// The slot is as wide as the widest primary action of the shown views, labelled or, once the row
// drops that label, as an icon; hidden copies of them hold the width. So every view measures the
// same row and gives way at the same width, with or without an action of its own.
function primarySlot(primary, reserve) {
  if (!primary && !reserve.length) return "";
  const copies = reserve.map((entry) => `<span class="voc-button voc-button--quiet voc-primary-copy">${icon(entry.icon)}<span class="voc-button-label">${e(entry.label)}</span></span>`).join("");
  return `<span class="voc-primary-slot">${primary}${copies ? `<span class="voc-primary-reserve" aria-hidden="true" inert>${copies}</span>` : ""}</span>`;
}

function renderTabRow(context, vm) {
  const primary = actionInHeader(vm) ? "" : primaryButton(context, vm);
  if (!vm.tabs.visible && !primary) return "";
  const tabs = vm.tabs.visible
    ? `<div class="voc-tabs" role="tablist" aria-label="${e(context.t("view.label"))}">${vm.tabs.tabs
        .map((tab) => `<button type="button" class="voc-tab" role="tab" id="voc-tab-${e(tab.key)}" data-key="tab-${e(tab.key)}" data-view="${e(tab.key)}" aria-controls="voc-panel" aria-selected="${tab.active}" tabindex="${tab.active ? 0 : -1}"${tab.available ? "" : ' data-unavailable="true"'} title="${e(tab.label)}">${icon(tab.icon)}<span class="voc-tab-label">${e(tab.label)}</span></button>`)
        .join("")}</div>`
    : `<div class="voc-tabs-spacer"></div>`;
  return `<div class="voc-tab-row">${tabs}${vm.tabs.visible ? primarySlot(primary, vm.primaryReserve) : primary}</div>`;
}

// Below a dialog the card is inert: no focus, no pointer, hidden from assistive technology. The
// live region stays outside, so an answer that arrives meanwhile is still announced.
function beneath(html, covered) {
  return covered && html ? html.replace(/^<(\w+)/u, "<$1 inert") : html;
}

export function renderCard(context, vm, renderBody) {
  const header = vm.header;
  const rootAttributes = [
    // LAY-08: the card's language, for hyphenation and screen readers.
    attr("lang", vm.language ?? null),
    `data-state="${e(vm.body.kind)}"`,
    `data-tone="${e(vm.tone)}"`,
    attr("data-parts", header.parts),
    attr("data-accent-line", vm.accentLinePosition === "bottom" ? "bottom" : null),
    attr("data-title", header.titleOverflow === "clip" ? "clip" : null),
    attr("data-subtitle", header.subtitleOverflow === "wrap" ? "wrap" : null),
    attr("data-scheme", vm.scheme === "dark" ? "dark" : null),
    attr("data-dialog", vm.dialog?.key ?? null),
    `style="${e(vm.toneStyle)}"`,
  ].join("");
  // A tab panel is a tab stop: no view starts with a focusable control, and in a frame it scrolls.
  const bodyRole = vm.body.kind === "view" && vm.tabs.visible ? ` role="tabpanel" aria-labelledby="voc-tab-${e(vm.body.key)}" tabindex="0"` : "";
  const covered = Boolean(vm.dialog);
  const background = [renderHeader(context, vm), renderWarning(vm.warning), renderNotice(context, vm.notice), renderPanel(context, vm.panel), renderTabRow(context, vm), `<div class="voc-body" id="voc-panel" data-body="${e(vm.body.kind)}:${e(vm.body.key || "")}" data-scroll${bodyRole}>${renderBody(context, vm.body)}</div>`];
  const dialog = covered ? `<div class="voc-scrim" data-key="dialog">${renderBody(context, vm.dialog)}</div>` : "";
  return `<div class="voc-root" ${rootAttributes} tabindex="-1">${vm.accentLine ? '<div class="voc-top-line"></div>' : ""}${background.map((part) => beneath(part, covered)).join("")}<div class="voc-live-region" aria-live="polite" aria-atomic="true">${e(vm.liveMessage)}</div>${dialog}</div>`;
}

export function renderFailure(message) {
  return `<div class="voc-root" data-state="error" tabindex="-1"><div class="voc-render-failed">${e(message)}</div></div>`;
}
