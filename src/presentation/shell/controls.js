// The two card-wide controls: the primary action beside the section bar and the queue control
// in the card's footer. Both follow the domain's one action policy, so the shell and the queue
// section can never offer different answers. See internal dev doc §5 "Steuerzeilen".

import { queueActions } from "../../domain/job.js";

const QUEUE_LABEL_KEY = Object.freeze({ run_queue: "runQueue", pause_queue: "pauseQueue", resume_queue: "resumeQueue" });
const QUEUE_ICON = Object.freeze({ run_queue: "mdi:play", pause_queue: "mdi:pause", resume_queue: "mdi:play" });
const DISABLED_KEY = Object.freeze({
  at_boundary: "atBoundary",
  not_queued: "notQueued",
  capability_missing: "capabilityMissing",
  command_pending: "commandPending",
  read_only: "readOnly",
});

// A missing capability or a read-only user leaves the control reachable so its explanation can
// be read; nothing else can make a card-wide control inert.
function control({ spec, label, icon, texts, className }) {
  const { state, reason } = spec.decision;
  const key = DISABLED_KEY[reason];
  return {
    visible: state !== "hidden",
    action: spec.action,
    command: spec.command,
    label,
    icon,
    className,
    disabled: state === "disabled" && reason === "command_pending",
    ariaDisabled: state === "disabled" && reason !== "command_pending",
    title: state === "disabled" && key ? texts.t(`action.disabled.${key}`) : "",
  };
}

export function buildCardControls({ model = {}, config = {}, texts, overlay = null } = {}) {
  const decisions = queueActions({
    mode: model.queue?.mode || "idle",
    capabilities: model.capabilities || {},
    canCommand: model.permissions?.canCommand !== false,
    pending: new Set(model.commands?.pending || []),
  });
  const queueCommand = decisions.queue.command;
  const primary = control({
    spec: decisions.create,
    label: texts.t("action.createJob"),
    icon: "mdi:plus",
    texts,
    className: "voc-primary-action",
  });
  const queue = control({
    spec: decisions.queue,
    label: texts.t(`action.${QUEUE_LABEL_KEY[queueCommand]}`),
    icon: QUEUE_ICON[queueCommand],
    texts,
    className: "voc-queue-command",
  });
  // An overlay is its own page: it replaces the section bar and the footer.
  const available = !overlay && model.connection?.state !== "backend_missing";
  return {
    primary: { ...primary, visible: primary.visible && available },
    queue: { ...queue, visible: queue.visible && available && config.show?.queue_controls !== false },
    mode: decisions.queue.mode,
  };
}
