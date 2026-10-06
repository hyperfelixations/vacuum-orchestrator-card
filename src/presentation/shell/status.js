// The card's overall status, read once and shared by tone, pill, subtitle and panel so they
// can never disagree. Precedence: connection phase, then attention, then work in progress,
// then the queue mode, then an unfinished setup. See internal dev doc §8 "Status und Ton".

import { slotData, list } from "../common/lookups.js";

const PHASE_STATUS = Object.freeze({
  probing: "connecting",
  not_installed: "notInstalled",
  not_set_up: "notSetUp",
  load_failed: "loadFailed",
  api_incompatible: "incompatible",
  check_failed: "checkFailed",
  offline: "offline",
});

export function cardStatus(model = {}) {
  if (model.phase && model.phase !== "ready") return PHASE_STATUS[model.phase] || "connecting";
  const queue = slotData(model, "queue");
  const openJobs = list(slotData(model, "openJobs")?.jobs);
  // The integration's counts; a live event is newer than the last queue read.
  const attentionCount = model.live?.attentionCount ?? queue?.attentionCount ?? 0;
  const activeCount = model.live?.activeCount ?? queue?.activeCount ?? 0;
  const attention = openJobs.some((job) => job.state === "needs_attention") || attentionCount > 0 || queue?.needsAttention || model.live?.needsAttention === true || list(queue?.recoveryTargets).length > 0;
  if (attention) return "attention";
  if (openJobs.some((job) => job.state !== "needs_attention") || activeCount > 0) return "cleaning";
  const mode = queue?.mode ?? model.live?.mode ?? null;
  if (mode === "running") return "running";
  if (mode === "paused") return "paused";
  if (!queue) return "connecting";
  if (model.setup?.known && !model.setup.complete) return "setup";
  return "idle";
}

const TONES = Object.freeze({
  attention: ["var(--error-color, #db4437)"],
  cleaning: ["var(--info-color, #039be5)"],
  running: ["var(--info-color, #039be5)"],
  paused: ["var(--warning-color, #ffa600)"],
  idle: ["var(--success-color, #43a047)"],
  setup: ["var(--primary-color, #03a9f4)"],
  connecting: ["var(--secondary-text-color)"],
  offline: ["var(--secondary-text-color)"],
  notInstalled: ["var(--secondary-text-color)"],
  notSetUp: ["var(--primary-color, #03a9f4)"],
  loadFailed: ["var(--error-color, #db4437)"],
  checkFailed: ["var(--error-color, #db4437)"],
  incompatible: ["var(--warning-color, #ffa600)"],
});

export function toneFor(status) {
  const [color] = TONES[status] || TONES.connecting;
  // The RCC tone token derivation: soft fill 20 % of the colour, border 38 % of the ink.
  return {
    key: status,
    style: `--tone-color:${color};--tone-ink:color-mix(in srgb, ${color} 82%, var(--primary-text-color));--tone-soft:color-mix(in srgb, ${color} 20%, transparent);--tone-border:color-mix(in srgb, var(--tone-ink) 38%, transparent);`,
  };
}
