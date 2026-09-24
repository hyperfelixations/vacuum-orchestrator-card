// The header: icon, title, the automatic status sentence and the status pill.
// Precedence of both the pill and the sentence: a connection problem, then jobs that need
// attention, then work in progress, then the waiting queue. See internal dev doc §5 "Kopfzeile".

const CONNECTION_STATUS = Object.freeze({
  connecting: "status.connecting",
  backend_missing: "status.notInstalled",
  backend_not_loaded: "status.notLoaded",
  api_incompatible: "status.incompatible",
  disconnected: "status.disconnected",
  reconnecting: "status.reconnecting",
});

const CONNECTION_SENTENCE = Object.freeze({
  backend_missing: "unavailable.backendMissing",
  backend_not_loaded: "unavailable.backendNotLoaded",
  api_incompatible: "unavailable.apiIncompatible",
  disconnected: "unavailable.disconnected",
});

const MODE_SUFFIX = Object.freeze({ vacuum_and_mop: "vacuumAndMop", vacuum_then_mop: "vacuumThenMop" });

function attentionCount(model) {
  return model.attention?.jobs?.length ?? 0;
}

function statusLabel(model, texts) {
  const key = CONNECTION_STATUS[model.connection?.state];
  if (key) return texts.t(key);
  if (attentionCount(model) > 0 || model.queue?.needsAttention) return texts.t("status.attention");
  if (model.queue?.mode === "running" || model.active?.jobs?.length) return texts.t("status.running");
  if (model.queue?.mode === "paused") return texts.t("status.paused");
  if (model.permissions?.canCommand === false) return texts.t("status.readOnly");
  return texts.t("status.idle");
}

function areaNames(job, model) {
  const catalog = new Map((model.areas?.catalog || []).map((area) => [area.areaId, area.name]));
  return job.areas.map((areaId) => catalog.get(areaId) || areaId).join(", ");
}

export function composeAutomaticSubtitle(model, texts) {
  const connection = CONNECTION_SENTENCE[model.connection?.state];
  if (connection) return texts.t(connection);
  const attention = attentionCount(model);
  if (attention > 0) return texts.t("subtitle.attention", { count: attention });
  const active = model.active?.jobs?.[0];
  if (active) {
    return texts.t("subtitle.activeJob", {
      name: active.name || areaNames(active, model),
      operation: texts.t(`job.mode.${MODE_SUFFIX[active.mode] || active.mode}`),
    });
  }
  const queued = model.queue?.total ?? 0;
  if (queued > 0) return texts.t(model.queue.mode === "paused" ? "subtitle.queuedPaused" : "subtitle.queued", { count: queued });
  return texts.t("subtitle.nothingToDo");
}

export function buildHeader({ model = {}, config = {}, texts } = {}) {
  const title = config.title?.text ?? texts.t("card.title");
  const subtitle = config.subtitle?.text ?? composeAutomaticSubtitle(model, texts);
  return {
    hasIcon: config.show?.icon !== false,
    icon: config.icon || "mdi:robot-vacuum",
    hasTitle: title !== "" && config.show?.title !== false,
    title,
    titleOverflow: config.title?.overflow || "wrap",
    hasSubtitle: subtitle !== "" && config.show?.subtitle !== false,
    subtitle,
    subtitleOverflow: config.subtitle?.overflow || "clip",
    hasPill: config.show?.pill !== false,
    statusLabel: statusLabel(model, texts),
  };
}
