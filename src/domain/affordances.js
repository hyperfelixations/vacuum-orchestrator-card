// Which controls the card offers. The integration decides per object which actions it offers now
// and why not (`actions`); the card adds only its own client-local reasons. Every command is still
// checked by the integration and a refusal is shown as such. See internal dev doc §7 "Affordances".

// The card's own reasons a visible control is unavailable; presentation words each one. Any
// other reason is an integration error code, worded by the integration. A read-only user's
// controls are hidden with the reason `read_only`, said once as a hint.
export const AFFORDANCE_REASONS = Object.freeze(["operation_missing", "command_pending", "connection_lost"]);

// Integration reasons that say an action does not apply to the object as it is; such a control
// is not shown. Every other reason keeps the control visible and explains why it is unavailable.
export const NOT_APPLICABLE = Object.freeze(new Set([
  "job_not_editable",
  "job_not_deletable",
  "job_not_movable",
  "job_not_retryable",
  "job_not_correctable",
  "job_not_waiting",
  "job_not_started",
  "job_not_cancellable",
  "job_not_startable",
  "queue_not_running",
  "queue_running",
  "queue_paused",
  "queue_ending",
  "room_unavailable",
  "room_not_released",
  "room_disabled",
  "room_enabled",
  "robot_at_dock",
  "robot_already_executing",
  "return_to_dock_unsupported",
  "no_suppressed_demand",
]));

const HIDDEN = Object.freeze({ state: "hidden", reason: null });
// A user who may change nothing sees no control that would change something; one hint says why
// (UI-22).
const READ_ONLY = Object.freeze({ state: "hidden", reason: "read_only" });
const ENABLED = Object.freeze({ state: "enabled", reason: null });
const disabled = (reason) => Object.freeze({ state: "disabled", reason });
// Offered, with what a person confirms first and the robots it is about.
const warned = (warning, robotIds) => Object.freeze({ state: "enabled", reason: null, warning, robotIds: Object.freeze([...(robotIds || [])]) });
const refused = (reason, detail) => Object.freeze({ state: "disabled", reason, source: "integration", detail: detail ?? null });

// `context`: { canCommand, connected, operations: Set of the operations the integration offers
// (registered actions and card commands), pending: Set of command targets in flight }.
export function affordanceContext({ canCommand = true, connected = true, operations = [], pending = [] } = {}) {
  return Object.freeze({
    canCommand: canCommand !== false,
    connected: connected !== false,
    operations: operations instanceof Set ? operations : new Set(operations),
    pending: pending instanceof Set ? pending : new Set(pending),
  });
}

// The card's own reasons, in order.
function local(context, operation, target) {
  if (!context.canCommand) return READ_ONLY;
  if (operation && !context.operations.has(operation)) return disabled("operation_missing");
  if (!context.connected) return disabled("connection_lost");
  if (target && context.pending.has(target)) return disabled("command_pending");
  return null;
}

// A control the integration gives no verdict for: creating, saving settings.
export function decide(context, { visible = true, operation, target = null }) {
  if (!visible) return HIDDEN;
  return local(context, operation, target) ?? ENABLED;
}

// A control for one of an object's actions: hidden without a verdict or where the action does not
// apply; otherwise the card's own reasons first, then the integration's.
export function offer(context, verdict, { operation, target = null }) {
  if (!verdict || (!verdict.available && NOT_APPLICABLE.has(verdict.reason))) return HIDDEN;
  return local(context, operation, target) ?? (verdict.available ? (verdict.warning ? warned(verdict.warning, verdict.robotIds) : ENABLED) : refused(verdict.reason, verdict.detail));
}

export const jobTarget = (jobId) => `job:${jobId}`;
export const roomTarget = (roomId) => `room:${roomId}`;
export const robotTarget = (robotId) => `robot:${robotId}`;
export const templateTarget = (templateId) => `template:${templateId}`;
export const QUEUE_TARGET = "queue";
export const ROOMS_TARGET = "rooms";
export const CREATE_TARGET = "create";
export const SETUP_TARGET = "setup";

export function jobAffordances(job, context) {
  const actions = job?.actions ?? null;
  const target = jobTarget(job?.jobId);
  const moveUp = offer(context, actions?.move_up, { operation: "move_job", target });
  const moveDown = offer(context, actions?.move_down, { operation: "move_job", target });
  return Object.freeze({
    moveUp,
    moveDown,
    moveTop: moveUp,
    moveBottom: moveDown,
    edit: offer(context, actions?.edit, { operation: "update_job", target }),
    start: offer(context, actions?.start, { operation: "start_job", target }),
    cancel: offer(context, actions?.cancel, { operation: "cancel_job", target }),
    delete: offer(context, actions?.delete, { operation: "delete_job", target }),
    retry: offer(context, actions?.retry, { operation: "retry_job", target }),
    correct: offer(context, actions?.correct, { operation: "correct_job", target }),
  });
}

const QUEUE_CONTROLS = Object.freeze([
  Object.freeze({ name: "run", operation: "run_queue" }),
  Object.freeze({ name: "pause", operation: "pause_queue" }),
  Object.freeze({ name: "resume", operation: "resume_queue" }),
]);

// The one of run, pause and resume the integration offers now, or null.
export function queueControl(actions) {
  return QUEUE_CONTROLS.find((control) => actions?.[control.name]?.available === true) ?? null;
}

// `queue`: the queue page as `normalizeQueuePage` returns it.
export function queueAffordances(queue, context) {
  const actions = queue?.actions ?? null;
  const control = queueControl(actions);
  return Object.freeze({
    command: control?.operation ?? null,
    control: control ? offer(context, actions[control.name], { operation: control.operation, target: QUEUE_TARGET }) : HIDDEN,
    end: offer(context, actions?.end, { operation: "end_queue", target: QUEUE_TARGET }),
    create: decide(context, { operation: "create_job", target: CREATE_TARGET }),
    configure: decide(context, { operation: "configure_queue", target: QUEUE_TARGET }),
  });
}

export function roomAffordances(room, context) {
  const actions = room?.actions ?? null;
  const target = roomTarget(room?.roomId);
  return Object.freeze({
    release: offer(context, actions?.release, { operation: "release_rooms", target }),
    revoke: offer(context, actions?.revoke, { operation: "revoke_rooms", target }),
    edit: offer(context, actions?.edit, { operation: "update_room", target }),
    disable: offer(context, actions?.disable, { operation: "disable_room", target }),
    enable: offer(context, actions?.enable, { operation: "enable_room", target }),
    createJob: offer(context, actions?.create_job, { operation: "create_job", target: CREATE_TARGET }),
  });
}

export function robotAffordances(robot, context) {
  const actions = robot?.actions ?? null;
  const target = robotTarget(robot?.robotId);
  return Object.freeze({
    configure: offer(context, actions?.configure, { operation: "configure_robot", target }),
    rename: offer(context, actions?.rename, { operation: "rename_robot", target }),
    remove: offer(context, actions?.remove, { operation: "remove_robot", target }),
    returnToDock: offer(context, actions?.return_to_dock, { operation: "return_robot", target }),
  });
}

export function recoveryAffordance(robotId, context) {
  return decide(context, { operation: "resolve_recovery", target: robotTarget(robotId) });
}

export function candidateAffordance(context) {
  return decide(context, { operation: "add_robot", target: CREATE_TARGET });
}

export function templateAffordances(template, context) {
  const actions = template?.actions ?? null;
  const target = templateTarget(template?.templateId);
  return Object.freeze({
    instantiate: offer(context, actions?.create_job, { operation: "create_job_from_template", target }),
    edit: offer(context, actions?.edit, { operation: "save_template", target }),
    remove: offer(context, actions?.remove, { operation: "remove_template", target }),
    resetDemand: offer(context, actions?.reset_demand, { operation: "reset_template_demand", target }),
  });
}
