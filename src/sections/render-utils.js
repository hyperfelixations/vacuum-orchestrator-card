// Markup-only section helpers. Variable text is escaped at this boundary; commands are
// represented by stable data attributes and interpreted by the card runtime.

import { escapeHtml } from "../core/text.js";
import { BACKEND_ERROR_MESSAGE_KEYS } from "../domain/backend-errors.js";
import { text as translate } from "../presentation/sections/helpers.js";

// A control is described either by the domain decision object or, for controls that have no
// job behind them, by a bare state word.
export function actionState(value) {
  if (typeof value === "string") return { state: value, reason: null };
  if (!value || typeof value !== "object") return { state: "hidden", reason: null };
  return { state: value.state || "hidden", reason: value.reason || null };
}

export function e(value) {
  return escapeHtml(value === null || value === undefined ? "" : String(value));
}

export function t(context, key, vars, fallback = key) {
  return translate(context?.texts, key, vars, fallback);
}

export function icon(context, name, label = "") {
  if (!name) return "";
  return `<ha-icon icon="${e(name)}"${label ? ` aria-label="${e(label)}"` : ' aria-hidden="true"'}></ha-icon>`;
}

function actionLabel(context, key, fallback = key) {
  return t(context, `action.${key}`, undefined, fallback);
}

// The closed reason vocabulary of `jobActions`, mapped to its translation key.
const ACTION_DISABLED_KEY = Object.freeze({
  at_boundary: "atBoundary",
  not_queued: "notQueued",
  capability_missing: "capabilityMissing",
  command_pending: "commandPending",
  read_only: "readOnly",
});

export function actionDisabledKey(reason) {
  return ACTION_DISABLED_KEY[reason] || null;
}

export function disabledReason(context, reason) {
  const key = actionDisabledKey(reason);
  return key ? t(context, `action.disabled.${key}`, undefined, key) : "";
}

// A boundary or a wrong job state makes the control genuinely inert; a missing capability or a
// read-only user keeps it focusable so the explanation can be read.
function isHardDisabled(reason) {
  return reason === "at_boundary" || reason === "not_queued" || reason === "command_pending";
}

export function actionButton(context, {
  action,
  state: suppliedState,
  jobId,
  direction,
  label,
  iconName,
  title,
  className = "",
  command,
  confirm = false,
  extra = "",
}) {
  const descriptor = actionState(suppliedState || "enabled");
  if (descriptor.state === "hidden") return "";
  const reason = disabledReason(context, descriptor.reason);
  const disabled = descriptor.state === "disabled" && isHardDisabled(descriptor.reason);
  const labelText = label || actionLabel(context, action);
  const titleText = title || reason || labelText;
  const iconMarkup = iconName ? icon(context, iconName) : "";
  return `<button type="button" class="voc-action-button${className ? ` ${e(className)}` : ""}" data-action="${e(action)}"${command ? ` data-command="${e(command)}"` : ""}${jobId ? ` data-job-id="${e(jobId)}"` : ""}${direction ? ` data-direction="${e(direction)}"` : ""}${confirm ? ' data-confirm="true"' : ""}${extra}${disabled ? " disabled" : ""}${descriptor.state === "disabled" && !disabled ? ' aria-disabled="true"' : ""}${descriptor.state === "disabled" ? ` title="${e(titleText)}"` : ""} aria-label="${e(labelText)}">${iconMarkup}<span class="voc-action-label">${e(labelText)}</span></button>`;
}

export function errorBanner(context, error, className = "") {
  if (!error) return "";
  const code = error.code || "unknown";
  const messageKey = error.messageKey || BACKEND_ERROR_MESSAGE_KEYS[code] || (code === "timeout" || code === "invalid_response" ? `error.backend.${code}` : "error.backend.unknown");
  const message = t(context, messageKey, { code, detail: error.detail || "" }, t(context, "error.backend.unknown", { code }, code));
  return `<div class="voc-error-banner${className ? ` ${e(className)}` : ""}" role="alert" data-error-code="${e(code)}"><span class="voc-error-icon" aria-hidden="true">!</span><span class="voc-error-message">${e(message)}</span></div>`;
}

export function unavailable(context, state) {
  if (!state) return "";
  const capability = state.capability || state.missingCapability;
  const message = capability
    ? t(context, state.key || "unavailable.capabilityMissing", { capability: t(context, `capability.${capability}`, undefined, capability) }, capability)
    : t(context, state.key || "unavailable.noSection", undefined, state.key || "—");
  return `<div class="voc-unavailable" role="status" data-capability="${e(capability || "")}">${e(message)}</div>`;
}

export function emptyState(context, key) {
  return `<div class="voc-empty-state" role="status">${e(t(context, `empty.${key}`, undefined, "—"))}</div>`;
}

export function setText(root, selector, value) {
  const node = root?.querySelector?.(selector);
  if (node) node.textContent = value === null || value === undefined ? "" : String(value);
  return node;
}

export function setAttribute(root, selector, name, value) {
  const node = root?.querySelector?.(selector);
  if (!node) return null;
  if (value === null || value === undefined || value === "") node.removeAttribute(name);
  else node.setAttribute(name, String(value));
  return node;
}

export function renderSettings(settings, context) {
  return settings.length
    ? `<span class="voc-job-settings" aria-label="${e(t(context, "form.settings", undefined, "Settings"))}">${settings.map((setting) => `<span class="voc-job-setting" data-setting-key="${e(setting.key)}">${e(setting.value)}</span>`).join('<span class="voc-setting-separator" aria-hidden="true"> · </span>')}</span>`
    : "";
}

export function actionStructure(actions) {
  return Object.entries(actions || {})
    .filter(([, descriptor]) => actionState(descriptor).state !== "hidden")
    .map(([key, descriptor]) => `${key}:${actionState(descriptor).state}`)
    .join(",");
}
