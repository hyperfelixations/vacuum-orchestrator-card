const TONES = Object.freeze({
  attention: ["var(--error-color, #db4437)", "var(--error-color, #db4437)"],
  running: ["var(--info-color, #039be5)", "var(--info-color, #039be5)"],
  paused: ["var(--warning-color, #ffa600)", "var(--warning-color, #ffa600)"],
  ready: ["var(--success-color, #0f9d58)", "var(--success-color, #0f9d58)"],
  idle: ["var(--secondary-text-color)", "var(--secondary-text-color)"],
  offline: ["var(--secondary-text-color)", "var(--secondary-text-color)"],
  unsupported: ["var(--disabled-text-color, var(--secondary-text-color))", "var(--secondary-text-color)"],
});

function toneStyle(key) {
  const [color, ink] = TONES[key] || TONES.idle;
  return `--tone-color:${color};--tone-ink:${ink};--tone-soft:color-mix(in srgb, ${color} 16%, transparent);--tone-border:color-mix(in srgb, ${color} 44%, transparent);`;
}

export function resolveTone(model = {}) {
  const connection = model.connection || {};
  const queue = model.queue || {};
  const attention = model.attention || {};
  let key = "idle";
  if (["backend_missing", "backend_not_loaded", "api_incompatible"].includes(connection.state)) key = "unsupported";
  else if (["disconnected", "reconnecting"].includes(connection.state)) key = "offline";
  else if ((attention.jobs?.length ?? 0) > 0 || queue.needsAttention) key = "attention";
  else if (queue.mode === "running" || (model.active?.jobs?.length ?? 0) > 0) key = "running";
  else if (queue.mode === "paused") key = "paused";
  else if (queue.available || connection.state === "connected") key = "ready";
  return { key, tone: key, style: toneStyle(key), color: TONES[key]?.[0] || TONES.idle[0] };
}

export function toneStyleDeclaration(tone) {
  return tone?.style || toneStyle(tone?.key || "idle");
}

export function resolveToneKey(model) {
  return resolveTone(model).key;
}
