// Small dialogs: confirming a destructive command, cancelling a started job, ending the queue,
// choosing a robot for a direct start, resolving a robot's recovery and the queue's quiet period.
// Each shows the integration's facts and sends one command.

import { QUEUE_TARGET, ROOMS_TARGET, decide, jobTarget, recoveryAffordance } from "../../domain/affordances.js";
import { ROOM_ORDERS } from "../../domain/rooms.js";
import { QUEUE_GRACE_MAX_SECONDS, START_DELAY_MAX_SECONDS } from "../../domain/job-schema.js";
import { findJob, list, robotName, robotsOf, roomIndex, slotData, jobTitle } from "../common/lookups.js";
import { number, reasonText, seconds, t } from "../common/texts.js";
import { numericReading } from "../../application/ha-entities.js";
import { pageErrors } from "./editor-fields.js";
import { readinessReasons } from "../views/job-row.js";

export function buildConfirm({ model, texts, overlay }) {
  const job = overlay.jobId ? findJob(model, overlay.jobId) : null;
  const vars = { ...(overlay.vars || {}), job: job ? jobTitle(job, roomIndex(model), model) : overlay.vars?.job ?? "" };
  return {
    key: "confirm",
    title: t(texts, overlay.titleKey, vars),
    text: t(texts, overlay.textKey, vars),
    confirmLabel: t(texts, overlay.confirmKey, vars),
    // The confirming button repeats the icon of the action it confirms.
    confirmIcon: overlay.icon || "mdi:check",
    tone: overlay.tone || "danger",
    pending: list(model.pending).includes(overlay.command?.options?.target),
  };
}

// JOB-27: a start below a robot's battery minimum, with the reading Home Assistant reports and the
// minimum of the robot's profile where both are known.
export function buildLowBatteryStart({ model, texts, overlay }) {
  const robot = robotsOf(model).find((entry) => entry.robotId === overlay.robotId) ?? null;
  const name = robot?.name ?? robotName(overlay.robotId, model);
  const battery = numericReading(model.robotsLive?.[overlay.robotId]?.roles?.battery);
  const minimum = robot?.configuration?.minimumBattery ?? null;
  return {
    key: "low-battery-start",
    title: t(texts, "confirm.lowBattery.title"),
    text: battery !== null && minimum !== null ? t(texts, "confirm.lowBattery.text", { robot: name, battery: number(texts, battery), minimum: number(texts, minimum) }) : t(texts, "confirm.lowBattery.textUnknown", { robot: name }),
    confirmLabel: t(texts, "confirm.lowBattery.confirm"),
    confirmIcon: "mdi:battery-alert-variant-outline",
    tone: "primary",
    pending: list(model.pending).includes(overlay.command?.options?.target),
  };
}

// What the robot does once a started job is cancelled: return home (the default), or stay
// where it is so the queue can go on from there.
export const AFTER_CANCEL_CHOICES = Object.freeze(["return_to_dock", "stay"]);

function radios(texts, key, labelKey, value, options) {
  return { key, label: t(texts, labelKey), control: "radios", value, options: options.map((option) => ({ value: option, label: t(texts, `${labelKey}.${option}`), description: t(texts, `${labelKey}.${option}.note`) })) };
}

export function buildCancelJob({ model, texts, overlay }) {
  const job = findJob(model, overlay.jobId);
  return {
    key: "cancel-job",
    title: t(texts, "confirm.cancelJob.title"),
    lead: t(texts, "cancelJob.lead", { job: job ? jobTitle(job, roomIndex(model), model) : "" }),
    field: radios(texts, "overlay:afterCancel", "cancelJob.after", overlay.afterCancel, AFTER_CANCEL_CHOICES),
    confirmLabel: t(texts, "confirm.cancelJob.confirm"),
    pending: list(model.pending).includes(jobTarget(overlay.jobId)),
  };
}

// Correcting a finished job's result (JOB-25): cleaned or not; the other one is chosen first.
export const CORRECTION_OUTCOMES = Object.freeze(["completed", "failed"]);

export function buildCorrectJob({ model, texts, overlay }) {
  const job = findJob(model, overlay.jobId);
  return {
    key: "correct-job",
    title: t(texts, "correctJob.title"),
    lead: t(texts, "correctJob.lead", { job: job ? jobTitle(job, roomIndex(model), model) : "" }),
    field: radios(texts, "overlay:outcome", "correctJob.outcome", overlay.outcome, CORRECTION_OUTCOMES),
    confirmLabel: t(texts, "correctJob.confirm"),
    pending: list(model.pending).includes(jobTarget(overlay.jobId)),
  };
}

// Ending a queue with started jobs: let them finish, or cancel them with either robot choice.
// Cancelling with a return home is offered only where some robot can return.
export function queueEndChoices(model) {
  const returns = robotsOf(model).some((robot) => robot.capabilities?.supports?.returnToDock === true);
  return ["finish", ...(returns ? ["cancel_return"] : []), "cancel_stay"];
}

export function buildQueueEnd({ model, texts, overlay }) {
  return {
    key: "queue-end",
    title: t(texts, "queueEnd.title"),
    lead: t(texts, "queueEnd.lead"),
    field: radios(texts, "overlay:choice", "queueEnd.running", overlay.choice, queueEndChoices(model)),
    confirmLabel: t(texts, "queueEnd.confirm"),
    pending: list(model.pending).includes(QUEUE_TARGET),
  };
}

// Automatic choice first: the integration's own selection. The explanation, when loaded,
// says per robot whether it could take the first phase now.
export function buildStartJob({ model, texts, context, overlay }) {
  const job = findJob(model, overlay.jobId);
  const index = roomIndex(model);
  const execution = slotData(model, "execution");
  const first = execution?.robots?.[0]?.operation ?? null;
  const explanation = new Map(list(execution?.robots).filter((item) => item.operation === first).map((item) => [item.robotId, item]));
  const decision = decide(context, { operation: "start_job", target: jobTarget(overlay.jobId) });
  const robots = robotsOf(model).map((robot) => {
    const item = explanation.get(robot.robotId);
    return {
      key: robot.robotId,
      robotId: robot.robotId,
      name: robot.name,
      eligible: item ? item.eligible : null,
      note: !item ? null : item.eligible ? t(texts, "detail.eligible") : reasonText(texts, item.eligibilityReason) || readinessReasons(item.readiness, { index, model, texts })[0] || t(texts, "readiness.blocked"),
    };
  });
  return {
    key: "start-job",
    jobId: overlay.jobId,
    title: t(texts, "start.title"),
    lead: t(texts, "start.lead", { job: job ? jobTitle(job, index, model) : "" }),
    robots,
    loading: !execution && model.slots?.execution?.status === "loading",
    decision,
  };
}

const GRACE_MAX_MINUTES = QUEUE_GRACE_MAX_SECONDS / 60;
// Quick choices for the grace period, in minutes; the stepper keeps any other value.
export const GRACE_QUICK_MINUTES = Object.freeze([5, 15, 30, 60]);

// The start delay of new and changed jobs, in seconds, and the quiet period after which a queue
// run without executable work ends, in whole minutes.
export function buildQueueSettings({ texts, context, overlay }) {
  const { minutes, delay } = overlay;
  const { error, invalid } = pageErrors(texts, overlay);
  return {
    key: "queue-settings",
    title: t(texts, "queueSettings.title"),
    // The grace period is changed more often than the start delay and comes first.
    fields: [
      { key: "overlay:graceQuick", label: t(texts, "settings.grace"), control: "segmented", value: GRACE_QUICK_MINUTES.find((value) => value === Number(minutes)) ?? null, options: GRACE_QUICK_MINUTES.map((value) => ({ value, label: seconds(texts, value * 60), icon: "mdi:timer-outline" })) },
      { key: "overlay:minutes", label: t(texts, "queueSettings.grace"), control: "stepper", value: Number.isFinite(minutes) ? minutes : 0, min: 0, max: GRACE_MAX_MINUTES, hint: t(texts, "queueSettings.graceHint"), error: error("overlay:minutes") },
      { key: "overlay:delay", label: t(texts, "queueSettings.delay"), control: "text", inputType: "number", value: delay ?? "", min: 0, max: START_DELAY_MAX_SECONDS, step: 1, hint: t(texts, "queueSettings.delayHint"), error: error("overlay:delay") },
    ],
    invalid,
    save: decide(context, { operation: "configure_queue", target: QUEUE_TARGET }),
  };
}

// How the rooms view lists rooms; the integration orders them (ROOM-13).
export function buildRoomOrder({ texts, context, overlay }) {
  return {
    key: "room-order",
    title: t(texts, "roomOrder.title"),
    field: { key: "overlay:order", label: t(texts, "settings.roomOrder"), control: "segmented", value: overlay.order, options: ROOM_ORDERS.map((value) => ({ value, label: t(texts, `settings.roomOrder.${value}`), icon: value === "due" ? "mdi:sort-clock-descending-outline" : "mdi:sort-alphabetical-ascending" })) },
    save: decide(context, { operation: "configure_room_order", target: ROOMS_TARGET }),
  };
}

export function buildRecovery({ model, texts, context, overlay }) {
  const target = list(slotData(model, "queue")?.recoveryTargets).find((entry) => entry.robotId === overlay.robotId);
  return {
    key: "recovery",
    robot: robotName(overlay.robotId, model),
    title: t(texts, "recovery.dialogTitle", { robot: robotName(overlay.robotId, model) }),
    reason: target ? reasonText(texts, target.reason) || t(texts, "recovery.reasonUnknown") : t(texts, "recovery.resolvedElsewhere"),
    open: Boolean(target),
    confirmStopped: overlay.confirmStopped === true,
    decision: recoveryAffordance(overlay.robotId, context),
  };
}
