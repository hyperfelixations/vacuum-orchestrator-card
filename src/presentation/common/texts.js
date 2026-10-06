// Wording and formatting through the injected text port. Every user-visible word of a view
// model passes through here; the card's own codes become translation keys, an integration code
// reads in the integration's own text, and a code without any text is named.
// See internal dev doc §8 "Wortwahl".

import { DUE_REASONS, FAILURE_CODES, READINESS_REASONS, isClientCode } from "../../domain/backend-errors.js";

const FAILURES = new Set(FAILURE_CODES);
const READINESS = new Set(READINESS_REASONS);
const DUE = new Set(DUE_REASONS);

export function t(texts, key, vars) {
  return texts && typeof texts.t === "function" ? texts.t(key, vars) : key;
}

export function number(texts, value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return typeof texts?.formatNumber === "function" ? texts.formatNumber(Number(value), digits) : String(value);
}

// Paging of an offset/limit/total page, or null while everything fits on one page.
export function pagination(page, texts) {
  if (!page || page.total <= page.limit) return null;
  const current = Math.floor(page.offset / page.limit) + 1;
  const pages = Math.max(1, Math.ceil(page.total / page.limit));
  return { page: current, pages, label: t(texts, "pagination.page", { page: current, pages }), hasPrevious: page.offset > 0, hasNext: page.offset + page.limit < page.total };
}

export function dateTime(texts, value) {
  if (value === null || value === undefined) return "—";
  return typeof texts?.formatDateTime === "function" ? texts.formatDateTime(value) : String(value);
}

export function relative(texts, value, nowMs) {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(nowMs)) return dateTime(texts, value);
  return typeof texts?.formatRelative === "function" ? texts.formatRelative(nowMs, value) : String(value);
}

export const AUTO_RELATIVE_MS = 24 * 60 * 60 * 1000;

// `relative` always relative, `absolute` always the timestamp, `auto` relative within a day of
// now and the timestamp beyond.
export function moment(texts, value, format, nowMs) {
  if (format === "absolute") return dateTime(texts, value);
  if (format !== "relative" && Number.isFinite(value) && Number.isFinite(nowMs) && Math.abs(nowMs - value) >= AUTO_RELATIVE_MS) return dateTime(texts, value);
  return relative(texts, value, nowMs);
}

export function duration(texts, milliseconds) {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return "—";
  return typeof texts?.formatDuration === "function" ? texts.formatDuration(Math.max(0, milliseconds)) : String(milliseconds);
}

export function seconds(texts, value) {
  return value === null || value === undefined ? "—" : duration(texts, value * 1000);
}

const camel = (value) => String(value).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

export const modeLabel = (texts, mode) => (mode ? t(texts, `mode.${camel(mode)}`) : "—");
export const modeShortLabel = (texts, mode) => (mode ? t(texts, `mode.short.${camel(mode)}`) : "—");
export const operationLabel = (texts, operation) => (operation ? t(texts, `operation.${camel(operation)}`) : t(texts, "value.unknown"));
export const jobStateLabel = (texts, state) => t(texts, `job.state.${camel(state || "unknown")}`);
// A rung of a setting ladder (`vacuumPower`, `mopIntensity`, `mopRoute`); `off` only names a
// robot option in its mapping.
export const settingLabel = (texts, field, value) => (!value ? "—" : value === "off" ? t(texts, "setting.off") : t(texts, `setting.${field}.${value}`));
export const settingName = (texts, field) => t(texts, `field.${field}`);
export const policyLabel = (texts, policy) => (policy ? t(texts, `policy.${camel(policy)}`) : "—");
export const readinessLabel = (texts, state) => t(texts, `readiness.${state || "unknown"}`);
export const qualityLabel = (texts, quality) => (quality ? t(texts, `quality.${quality}`) : t(texts, "value.unknown"));
export const releaseKindLabel = (texts, kind) => t(texts, `release.kind.${camel(kind)}`);
export const attemptStateLabel = (texts, state) => t(texts, `attempt.state.${camel(state || "unknown")}`);
export const queueModeLabel = (texts, mode) => t(texts, `queue.mode.${mode || "idle"}`);

const ADAPTERS = Object.freeze({ roborock: "robot.adapter.roborock", home_assistant: "robot.adapter.homeAssistant" });

export function adapterLabel(texts, adapter) {
  return ADAPTERS[adapter] ? t(texts, ADAPTERS[adapter]) : adapter || t(texts, "value.unknown");
}

// The integration's text for one of its codes, or null while none is known.
function integrationText(texts, code, detail = null) {
  return typeof texts?.backend === "function" ? texts.backend(code, { code, detail: detail ?? "" }) : null;
}

// A failed request in one sentence.
export function failureText(texts, failure) {
  if (!failure) return "";
  const code = failure.code || "unknown";
  if (isClientCode(code)) return t(texts, `error.code.${code}`, { detail: failure.detail ?? "" });
  return integrationText(texts, code, failure.detail) ?? t(texts, "error.unknownCode", { code });
}

// Why a job, attempt or run ended without success (`failure_code`).
export function outcomeText(texts, code) {
  if (!code) return null;
  if (FAILURES.has(code)) return t(texts, `failure.${code}`);
  return integrationText(texts, code) ?? t(texts, "failure.other", { code });
}

// Why a robot cannot take a phase (`eligibility_reason`) or a profile is blocked.
export function reasonText(texts, code) {
  if (!code) return null;
  if (READINESS.has(code)) return t(texts, `readiness.reason.${code}`);
  if (FAILURES.has(code)) return t(texts, `failure.${code}`);
  return integrationText(texts, code) ?? t(texts, "reason.other", { code });
}

export function readinessReasonText(texts, code) {
  return READINESS.has(code) ? t(texts, `readiness.reason.${code}`) : t(texts, "reason.other", { code });
}

export function dueReasonText(texts, code) {
  if (!code) return null;
  return DUE.has(code) ? t(texts, `due.reason.${code}`) : t(texts, "reason.other", { code });
}
