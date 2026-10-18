// The card's overall status, read once and shared by tone, pill, subtitle and panel so they
// can never disagree. Precedence: connection phase, then attention, then work in progress,
// then the queue mode, then a pending setup assistant. See internal dev doc §8 "Status und Ton".

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
  if (model.setup?.assistantPending) return "setup";
  // Jobs waiting on a queue nobody started are not "ready" to run (V6).
  return (queue.total ?? model.live?.pendingJobs ?? 0) > 0 ? "waiting" : "idle";
}

// [tone, control accent]: the accent is the tone, except that an error tone leaves the controls
// in the primary colour; the error colour marks only errors and destructive actions (UI-20).
const PRIMARY = "var(--primary-color, #03a9f4)";
const TONES = Object.freeze({
  attention: ["var(--error-color, #db4437)", PRIMARY],
  cleaning: ["var(--info-color, #039be5)"],
  running: ["var(--info-color, #039be5)"],
  paused: ["var(--warning-color, #ffa600)"],
  idle: ["var(--success-color, #43a047)"],
  waiting: ["var(--secondary-text-color)", PRIMARY],
  setup: ["var(--primary-color, #03a9f4)"],
  connecting: ["var(--secondary-text-color)"],
  offline: ["var(--secondary-text-color)"],
  notInstalled: ["var(--secondary-text-color)"],
  notSetUp: ["var(--primary-color, #03a9f4)"],
  loadFailed: ["var(--error-color, #db4437)", PRIMARY],
  checkFailed: ["var(--error-color, #db4437)", PRIMARY],
  incompatible: ["var(--warning-color, #ffa600)"],
});

const TONE_TOKENS = Object.freeze({ color: "--tone-color", ink: "--tone-ink", soft: "--tone-soft", border: "--tone-border" });
const ACCENT_TOKENS = Object.freeze({ color: "--voc-accent", ink: "--voc-accent-ink", soft: "--voc-accent-soft", border: "--voc-accent-border" });

// The RCC tone token derivation: soft fill 20 % of the colour, border 38 % of the ink.
function derive({ color, ink, soft, border }, value) {
  return `${color}:${value};${ink}:color-mix(in srgb, ${value} 82%, var(--primary-text-color));${soft}:color-mix(in srgb, ${value} 20%, transparent);${border}:color-mix(in srgb, var(${ink}) 38%, transparent);`;
}

// The tone colours pill, badge and accent line; the accent (`--voc-accent*`) colours the controls.
export function toneFor(status) {
  const [color, accent = color] = TONES[status] || TONES.connecting;
  return { key: status, style: `${derive(TONE_TOKENS, color)}${derive(ACCENT_TOKENS, accent)}` };
}
