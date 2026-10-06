// Which controls the card offers, mirrored from the integration's documented command
// preconditions. This decides only what is shown and enabled; every command is still checked by
// the integration and a refusal is shown as such. See internal dev doc §7 "Affordances".

import { isActiveState, isTerminalState } from "./job-schema.js";

// Closed vocabulary of reasons a visible control is unavailable; presentation words each one.
export const AFFORDANCE_REASONS = Object.freeze(["read_only", "operation_missing", "command_pending", "at_boundary", "robot_busy", "template_disabled"]);

const HIDDEN = Object.freeze({ state: "hidden", reason: null });
const ENABLED = Object.freeze({ state: "enabled", reason: null });
const disabled = (reason) => Object.freeze({ state: "disabled", reason });

// `context`: { canCommand, operations: Set of registered integration actions, pending: Set of
// command targets in flight }.
export function affordanceContext({ canCommand = true, operations = [], pending = [] } = {}) {
  return Object.freeze({
    canCommand: canCommand !== false,
    operations: operations instanceof Set ? operations : new Set(operations),
    pending: pending instanceof Set ? pending : new Set(pending),
  });
}

export function decide(context, { visible = true, operation, target = null, blockedBy = null }) {
  if (!visible) return HIDDEN;
  if (!context.canCommand) return disabled("read_only");
  if (operation && !context.operations.has(operation)) return disabled("operation_missing");
  if (target && context.pending.has(target)) return disabled("command_pending");
  if (blockedBy) return disabled(blockedBy);
  return ENABLED;
}

export const jobTarget = (jobId) => `job:${jobId}`;
export const roomTarget = (roomId) => `room:${roomId}`;
export const robotTarget = (robotId) => `robot:${robotId}`;
export const templateTarget = (templateId) => `template:${templateId}`;
export const QUEUE_TARGET = "queue";
export const CREATE_TARGET = "create";

// Preconditions from `domain/queue.py`: edit, move and start need `queued`; delete needs
// `queued` or terminal; cancel needs `queued`, `dispatching` or `running`; retry needs terminal.
export function jobAffordances(job, context, { position = null, total = 0 } = {}) {
  const state = job?.state;
  const target = jobTarget(job?.jobId);
  const queued = state === "queued";
  const atTop = position !== null && position <= 1;
  const atBottom = position !== null && position >= total;
  const move = (boundary) => decide(context, { visible: queued, operation: "move_job", target, blockedBy: boundary ? "at_boundary" : null });
  return Object.freeze({
    moveUp: move(atTop),
    moveDown: move(atBottom),
    moveTop: move(atTop),
    moveBottom: move(atBottom),
    edit: decide(context, { visible: queued, operation: "update_job", target }),
    start: decide(context, { visible: queued, operation: "start_job", target }),
    cancel: decide(context, { visible: queued || (isActiveState(state) && state !== "canceling"), operation: "cancel_job", target }),
    delete: decide(context, { visible: queued || isTerminalState(state), operation: "delete_job", target }),
    retry: decide(context, { visible: isTerminalState(state), operation: "retry_job", target }),
  });
}

const QUEUE_COMMAND_BY_MODE = Object.freeze({ idle: "run_queue", running: "pause_queue", paused: "resume_queue" });

// Ending is offered while the queue runs or pauses and is not already ending.
export function queueAffordances(mode, context, { ending = false } = {}) {
  const command = QUEUE_COMMAND_BY_MODE[mode] || "run_queue";
  return Object.freeze({
    command,
    control: decide(context, { operation: command, target: QUEUE_TARGET }),
    end: decide(context, { visible: mode !== "idle" && !ending, operation: "end_queue", target: QUEUE_TARGET }),
    create: decide(context, { operation: "create_job", target: CREATE_TARGET }),
    configure: decide(context, { operation: "configure_queue", target: QUEUE_TARGET }),
  });
}

export function roomAffordances(room, context) {
  const target = roomTarget(room?.roomId);
  const usable = Boolean(room?.enabled) && !room?.areaMissing;
  return Object.freeze({
    release: decide(context, { visible: usable, operation: "release_room", target }),
    revoke: decide(context, { visible: room?.release !== null && room?.release !== undefined, operation: "revoke_room", target }),
    edit: decide(context, { operation: "update_room", target }),
    disable: decide(context, { visible: Boolean(room?.enabled), operation: "disable_room", target }),
    enable: decide(context, { visible: room?.enabled === false, operation: "enable_room", target }),
    createJob: decide(context, { visible: usable, operation: "create_job", target: CREATE_TARGET }),
  });
}

// An active lease blocks reconfiguration and removal (`require_idle_robot`). Sending a robot
// home is offered when it can return, holds no lease and is not already home or on its way.
export function robotAffordances(robot, context, { home = false } = {}) {
  const target = robotTarget(robot?.robotId);
  const busy = robot?.active ? "robot_busy" : null;
  return Object.freeze({
    configure: decide(context, { operation: "configure_robot", target, blockedBy: busy }),
    remove: decide(context, { operation: "remove_robot", target, blockedBy: busy }),
    returnToDock: decide(context, { visible: robot?.capabilities?.supports?.returnToDock === true && !robot.active && !home, operation: "return_robot", target }),
  });
}

export function recoveryAffordance(robotId, context) {
  return decide(context, { operation: "resolve_recovery", target: robotTarget(robotId) });
}

export function candidateAffordance(context) {
  return decide(context, { operation: "add_robot", target: CREATE_TARGET });
}

export function templateAffordances(template, context) {
  const target = templateTarget(template?.templateId);
  return Object.freeze({
    instantiate: decide(context, { operation: "create_job_from_template", target, blockedBy: template?.enabled === false ? "template_disabled" : null }),
    edit: decide(context, { operation: "save_template", target }),
    remove: decide(context, { operation: "remove_template", target }),
    resetDemand: decide(context, { visible: (template?.suppressedRoomIds?.length ?? 0) > 0, operation: "reset_template_demand", target }),
  });
}
