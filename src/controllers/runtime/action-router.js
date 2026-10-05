// Every control's `data-action` ends here and becomes UI navigation or one integration command.
// Destructive commands pass through a confirmation page unless `confirm_destructive: false`.
// The router decides nothing about domain rules: the integration answers every command, and a
// refusal becomes this card's notice. See internal dev doc §9 "Aktionsvertrag".

import { CREATE_TARGET, QUEUE_TARGET, jobTarget, robotTarget, roomTarget, templateTarget } from "../../domain/affordances.js";
import { applyDraftChange, createDraft, draftToIntent, draftToTemplate, draftToUpdatePatch, validateDraft } from "../../domain/job-draft.js";
import { createRoomDraft, newBinding, newRequirement, roomDraftToPatch, updateRoomDraft, validateRoomDraft } from "../../domain/room-draft.js";
import { createRobotDraft, robotDraftToConfiguration, updateRobotDraft, validateRobotDraft } from "../../domain/robot-draft.js";
import { GRACE_MAX_MINUTES } from "../../presentation/overlays/dialogs.js";

// Each editor overlay names the reducer and the validator of its draft.
const DRAFT_REDUCERS = Object.freeze({
  "job-editor": applyDraftChange,
  "room-editor": updateRoomDraft,
  "robot-editor": updateRobotDraft,
});
const DRAFT_VALIDATORS = Object.freeze({
  "job-editor": validateDraft,
  "room-editor": validateRoomDraft,
  "robot-editor": validateRobotDraft,
});

const QUEUE_SCOPES = Object.freeze(["queue", "openJobs", "jobLog", "job", "execution", "trace"]);
const ROOM_SCOPES = Object.freeze(["rooms", "queue", "openJobs", "job", "execution"]);
const ROBOT_SCOPES = Object.freeze(["robots", "candidates", "rooms", "queue", "openJobs", "execution", "registry"]);
const ALL = "all";

function findIn(model, slot, idKey, id) {
  const data = model?.slots?.[slot]?.data;
  const items = data?.items || data?.jobs || [];
  return items.find((item) => item[idKey] === id) || null;
}

function findJob(model, jobId) {
  const detail = model?.slots?.job?.data;
  if (detail?.jobId === jobId) return detail;
  for (const slot of ["queue", "openJobs", "jobLog"]) {
    const job = findIn(model, slot, "jobId", jobId);
    if (job) return job;
  }
  return null;
}

export function createActionRouter({ ui, getSession, getModel, getConfig, platform }) {
  // `closeOverlay`: true leaves the top page after success, "all" every page.
  async function run(operation, parameters, { target = operation, invalidates = ALL, success = null, closeOverlay = false } = {}) {
    const session = getSession();
    if (!session) return null;
    ui.setNotice(null);
    const result = await session.command(operation, parameters, { target, invalidates });
    if (result?.ok) {
      if (closeOverlay === "all") ui.closeAllOverlays();
      else if (closeOverlay) ui.closeOverlay();
      if (success) ui.setNotice({ kind: "success", messageKey: success.key, vars: success.vars || null });
    } else if (result) {
      ui.setNotice({ kind: "error", operation, failure: result });
    }
    return result;
  }

  // A destructive command asks first; the confirmation page carries the command.
  function confirmOr(command, confirmation) {
    if (getConfig()?.confirm_destructive === false) return run(command.operation, command.parameters, command.options);
    ui.openOverlay({ kind: "confirm", ...confirmation, command });
    return null;
  }

  function editDraft(field, value) {
    const overlay = ui.overlay;
    const reduce = DRAFT_REDUCERS[overlay?.kind];
    if (!overlay?.draft || !reduce) return;
    ui.updateOverlay({ draft: reduce(overlay.draft, field, value) });
  }

  // A field name addresses the draft; `overlay:<key>` addresses the page's own state (a dialog's
  // choice) and `query:<field>` the search text of an entity picker.
  function setValue(field, value) {
    if (typeof field !== "string") return;
    if (field.startsWith("overlay:")) {
      ui.updateOverlay({ [field.slice("overlay:".length)]: value });
      return;
    }
    if (field.startsWith("query:")) {
      ui.updateOverlay({ queries: { ...(ui.overlay?.queries || {}), [field.slice("query:".length)]: String(value ?? "") } });
      return;
    }
    editDraft(field, value);
  }

  function findRoom(roomId) {
    return findIn(getModel(), "rooms", "roomId", roomId);
  }

  async function saveDraft() {
    const overlay = ui.overlay;
    if (!overlay?.draft) return;
    const validation = validateDraft(overlay.draft);
    if (!validation.valid) {
      ui.updateOverlay({ submitted: true });
      return;
    }
    const { kind, id } = overlay.draft.meta;
    if (kind === "template") {
      await run("save_template", draftToTemplate(overlay.draft), { target: id ? templateTarget(id) : CREATE_TARGET, invalidates: ["templates"], closeOverlay: true, success: { key: "notice.templateSaved" } });
    } else if (id) {
      const patch = draftToUpdatePatch(overlay.draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        return;
      }
      await run("update_job", { job_id: id, ...patch }, { target: jobTarget(id), invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobUpdated" } });
    } else {
      await run("create_job", draftToIntent(overlay.draft), { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobCreated" } });
    }
  }

  const handlers = {
    navigate: ({ path }) => platform.navigate?.(path),
    "dismiss-notice": () => ui.setNotice(null),
    reload: () => getSession()?.probe(),
    // Leaving an editor with unsaved changes asks first, like any other destructive step.
    back: () => {
      const top = ui.overlay;
      const validate = DRAFT_VALIDATORS[top?.kind];
      if (top?.draft && validate?.(top.draft).dirty && getConfig()?.confirm_destructive !== false) {
        ui.openOverlay({ kind: "confirm", titleKey: "confirm.discard.title", textKey: "confirm.discard.text", confirmKey: "confirm.discard.confirm", icon: "mdi:close", command: { discard: true } });
        return;
      }
      ui.closeOverlay();
    },
    toggle: ({ key }) => ui.toggle(key),
    choose: ({ key, value }) => ui.choose(key, value),
    page: ({ scope, direction }) => {
      const model = getModel();
      const data = model?.slots?.[scope]?.data;
      const limit = data?.limit || getConfig()?.page_size || 25;
      const offset = data?.offset ?? 0;
      ui.setPage(scope, direction === "previous" ? offset - limit : offset + limit);
    },

    "queue-control": () => {
      const mode = getModel()?.slots?.queue?.data?.mode ?? "idle";
      const command = mode === "running" ? "pause_queue" : mode === "paused" ? "resume_queue" : "run_queue";
      return run(command, {}, { target: QUEUE_TARGET, invalidates: ["queue", "openJobs"] });
    },
    "open-job": ({ jobId }) => ui.openOverlay({ kind: "job-detail", jobId }),
    "create-job": ({ roomIds = null } = {}) => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", defaults: roomIds ? { roomIds } : {} }) }),
    "edit-job": ({ jobId }) => {
      const job = findJob(getModel(), jobId);
      if (job) ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", target: job }) });
    },
    "set-field": ({ field, value }) => setValue(field, value),
    "toggle-value": ({ field, value }) => {
      const overlay = ui.overlay;
      if (overlay?.kind === "room-editor" && field === "occupancyEntityId") {
        editDraft(field, overlay.draft.occupancyEntityId === value ? null : value);
        ui.updateOverlay({ queries: { ...(ui.overlay.queries || {}), [field]: "" } });
        return;
      }
      // A robot role takes one entity: picking sets it, picking it again clears it.
      if (overlay?.kind === "robot-editor" && /^roles\.[a-z_]+\.entity$/.test(field)) {
        const current = field.split(".").reduce((node, part) => node?.[part], overlay.draft);
        editDraft(field, current === value ? null : value);
        ui.updateOverlay({ queries: { ...(ui.overlay.queries || {}), [field]: "" } });
        return;
      }
      if ((overlay?.kind === "room-editor" || overlay?.kind === "robot-editor") && field === "requirementsAdd") {
        editDraft("requirements", [...overlay.draft.requirements, newRequirement(value)]);
        ui.updateOverlay({ queries: { ...(ui.overlay.queries || {}), [field]: "" } });
        return;
      }
      const current = ui.overlay?.draft?.[field];
      const list = Array.isArray(current) ? current : [];
      editDraft(field, list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
      // A picked search result clears its search.
      if (ui.overlay?.queries?.[field]) ui.updateOverlay({ queries: { ...ui.overlay.queries, [field]: "" } });
    },
    "step-field": ({ field, step, min, max }) => {
      const own = typeof field === "string" && field.startsWith("overlay:");
      const current = Number(own ? ui.overlay?.[field.slice("overlay:".length)] : ui.overlay?.draft?.[field]);
      const base = Number.isFinite(current) ? current : min;
      setValue(field, Math.min(max, Math.max(min, base + step)));
    },
    "save-draft": () => saveDraft(),
    "move-job": ({ jobId, direction }) => run("move_job", { job_id: jobId, direction }, { target: jobTarget(jobId), invalidates: ["queue"] }),
    "start-job": ({ jobId, robotId = null, choose = true }) => {
      const robots = getModel()?.slots?.robots?.data?.items || [];
      if (choose && robots.length > 1 && !robotId) {
        ui.openOverlay({ kind: "start-job", jobId });
        return null;
      }
      const parameters = robotId ? { job_id: jobId, robot_id: robotId } : { job_id: jobId };
      return run("start_job", parameters, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, closeOverlay: ui.overlay?.kind === "start-job", success: { key: "notice.jobStarted" } });
    },
    "cancel-job": ({ jobId }) => confirmOr(
      { operation: "cancel_job", parameters: { job_id: jobId }, options: { target: jobTarget(jobId), invalidates: QUEUE_SCOPES } },
      { titleKey: "confirm.cancelJob.title", textKey: "confirm.cancelJob.text", confirmKey: "confirm.cancelJob.confirm", icon: "mdi:stop-circle-outline", jobId }
    ),
    // Deleting from the detail page or the editor leaves every page: they all showed that job.
    "delete-job": ({ jobId }) => confirmOr(
      { operation: "delete_job", parameters: { job_id: jobId }, options: { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, closeOverlay: ["job-detail", "job-editor"].includes(ui.overlay?.kind) ? "all" : false } },
      { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", icon: "mdi:delete-outline", jobId }
    ),
    "retry-job": ({ jobId }) => run("retry_job", { job_id: jobId }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, success: { key: "notice.jobRetried" } }),
    "confirm-command": async () => {
      const command = ui.overlay?.command;
      if (!command) return null;
      // The confirmation closes first, giving back the page it interrupted; a discard also
      // leaves that page.
      ui.closeOverlay();
      if (command.discard) {
        ui.closeOverlay();
        return null;
      }
      return run(command.operation, command.parameters, command.options);
    },
    "create-from-template": ({ templateId }) => run("create_job_from_template", { template_id: templateId }, { target: templateTarget(templateId), invalidates: QUEUE_SCOPES, success: { key: "notice.jobCreated" } }),
    "create-template": () => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template" }) }),
    "edit-template": ({ templateId }) => {
      const template = findIn(getModel(), "templates", "templateId", templateId);
      if (template) ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template", target: template }) });
    },
    "remove-template": ({ templateId }) => confirmOr(
      { operation: "remove_template", parameters: { template_id: templateId }, options: { target: templateTarget(templateId), invalidates: ["templates"], closeOverlay: ui.overlay?.kind === "job-editor", success: { key: "notice.templateRemoved" } } },
      { titleKey: "confirm.removeTemplate.title", textKey: "confirm.removeTemplate.text", confirmKey: "confirm.removeTemplate.confirm", icon: "mdi:delete-outline", vars: { template: findIn(getModel(), "templates", "templateId", templateId)?.name ?? "" } }
    ),
    "reset-template-demand": ({ templateId }) => run("reset_template_demand", { template_id: templateId }, { target: templateTarget(templateId), invalidates: ["templates"], success: { key: "notice.templateDemandReset" } }),
    "open-release": ({ roomId }) => ui.openOverlay({ kind: "release", roomId, releaseKind: "queue_run", hours: 2, minutes: 0 }),
    "release-room": ({ roomId }) => releaseRoom(roomId, ui.overlay?.kind === "release" ? ui.overlay : null),
    "revoke-room": ({ roomId, close = false }) => run("revoke_room", { room_id: roomId }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: close, success: { key: "notice.roomLocked" } }),
    "edit-room": ({ roomId }) => {
      const room = findRoom(roomId);
      if (room) ui.openOverlay({ kind: "room-editor", draft: createRoomDraft(room) });
    },
    "save-room": async () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "room-editor") return null;
      if (!validateRoomDraft(overlay.draft).valid) {
        ui.updateOverlay({ submitted: true });
        return null;
      }
      const patch = roomDraftToPatch(overlay.draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        return null;
      }
      const roomId = overlay.draft.meta.roomId;
      return run("update_room", { room_id: roomId, configuration: patch }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomSaved" } });
    },
    "remove-requirement": ({ index }) => editDraft("requirements", ui.overlay.draft.requirements.filter((_item, position) => position !== index)),
    "add-binding": ({ robotId }) => ui.updateOverlay({ draft: updateRoomDraft(ui.overlay.draft, "bindings", [...ui.overlay.draft.bindings, newBinding(robotId)]), bindingsOpen: true }),
    "remove-binding": ({ index }) => editDraft("bindings", ui.overlay.draft.bindings.filter((_item, position) => position !== index)),
    "disable-room": ({ roomId }) => confirmOr(
      { operation: "disable_room", parameters: { room_id: roomId }, options: { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: ui.overlay?.kind === "room-editor", success: { key: "notice.roomDisabled" } } },
      { titleKey: "confirm.disableRoom.title", textKey: "confirm.disableRoom.text", confirmKey: "confirm.disableRoom.confirm", icon: "mdi:eye-off-outline", vars: { room: findRoom(roomId)?.name ?? "" } }
    ),
    "enable-room": ({ roomId }) => run("enable_room", { room_id: roomId }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, success: { key: "notice.roomEnabled" } }),
    "create-room": () => ui.openOverlay({ kind: "room-create", name: "", areaId: null }),
    "save-new-room": () => {
      const overlay = ui.overlay;
      const name = String(overlay?.name ?? "").trim();
      if (!name) {
        ui.updateOverlay({ submitted: true });
        return null;
      }
      const parameters = overlay.areaId ? { name, area_id: overlay.areaId } : { name };
      return run("create_room", parameters, { target: CREATE_TARGET, invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomCreated" } });
    },
    "add-robot": () => ui.openOverlay({ kind: "robot-add" }),
    "add-candidate": ({ entityId }) => run("add_robot", { configuration: { robot_entity_id: entityId } }, { target: CREATE_TARGET, invalidates: ROBOT_SCOPES, closeOverlay: ui.overlay?.kind === "robot-add", success: { key: "notice.robotAdded" } }),
    "edit-robot": ({ robotId }) => {
      const robot = findIn(getModel(), "robots", "robotId", robotId);
      const live = getModel()?.robotsLive?.[robotId]?.roles || {};
      const roleEntities = Object.fromEntries(Object.entries(live).filter(([, reading]) => reading?.entityId).map(([role, reading]) => [role, reading.entityId]));
      if (robot) ui.openOverlay({ kind: "robot-editor", draft: createRobotDraft(robot, { roleEntities }), open: [] });
    },
    "toggle-section": ({ key }) => {
      const open = ui.overlay?.open || [];
      ui.updateOverlay({ open: open.includes(key) ? open.filter((item) => item !== key) : [...open, key] });
    },
    "remove-option": ({ field }) => {
      const [, group, key] = String(field).split(".");
      const entries = { ...(ui.overlay?.draft?.optionMaps?.[group] || {}) };
      delete entries[key];
      editDraft(`optionMaps.${group}`, entries);
    },
    "add-option": ({ group }) => {
      const overlay = ui.overlay;
      const key = String(overlay?.newOptionKey ?? "").trim();
      const value = String(overlay?.newOptionValue ?? "").trim();
      if (!key || !value) return;
      editDraft(`optionMaps.${group}`, { ...(overlay.draft.optionMaps[group] || {}), [key]: value });
      ui.updateOverlay({ newOptionKey: "", newOptionValue: "" });
    },
    "save-robot": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "robot-editor") return null;
      if (!validateRobotDraft(overlay.draft).valid) {
        ui.updateOverlay({ submitted: true });
        return null;
      }
      const robotId = overlay.draft.meta.robotId;
      return run("configure_robot", { robot_id: robotId, configuration: robotDraftToConfiguration(overlay.draft) }, { target: robotTarget(robotId), invalidates: ROBOT_SCOPES, closeOverlay: true, success: { key: "notice.robotSaved" } });
    },
    "remove-robot": ({ robotId }) => confirmOr(
      { operation: "remove_robot", parameters: { robot_id: robotId }, options: { target: robotTarget(robotId), invalidates: ROBOT_SCOPES, closeOverlay: ui.overlay?.kind === "robot-editor", success: { key: "notice.robotRemoved" } } },
      { titleKey: "confirm.removeRobot.title", textKey: "confirm.removeRobot.text", confirmKey: "confirm.removeRobot.confirm", icon: "mdi:delete-outline", vars: { robot: findIn(getModel(), "robots", "robotId", robotId)?.name ?? "" } }
    ),
    "open-queue-settings": () => {
      const seconds = getModel()?.slots?.queue?.data?.graceSeconds;
      if (Number.isFinite(seconds)) ui.openOverlay({ kind: "queue-settings", minutes: Math.round(seconds / 60) });
    },
    "save-queue-settings": () => {
      const minutes = Number(ui.overlay?.minutes);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > GRACE_MAX_MINUTES) {
        ui.updateOverlay({ submitted: true });
        return null;
      }
      return run("configure_queue", { grace_seconds: minutes * 60 }, { target: QUEUE_TARGET, invalidates: ["queue"], closeOverlay: true, success: { key: "notice.queueSettingsSaved" } });
    },
    "open-recovery": ({ robotId }) => ui.openOverlay({ kind: "recovery", robotId, confirmStopped: false }),
    "set-overlay": (patch) => ui.updateOverlay(patch),
    "resolve-recovery": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "recovery") return null;
      return run("resolve_recovery", { robot_id: overlay.robotId, confirm_stopped: overlay.confirmStopped === true }, { target: robotTarget(overlay.robotId), closeOverlay: true, success: { key: "notice.recoveryResolved" } });
    },
  };

  function releaseRoom(roomId, overlay) {
    const kind = overlay?.releaseKind || "queue_run";
    const parameters = { room_id: roomId, kind };
    if (kind === "timed") {
      const seconds = (Number(overlay.hours ?? 2) * 60 + Number(overlay.minutes ?? 0)) * 60;
      if (!(seconds > 0)) {
        ui.updateOverlay({ submitted: true });
        return null;
      }
      parameters.duration_seconds = seconds;
    }
    return run("release_room", parameters, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: overlay?.kind === "release", success: { key: "notice.roomReleased" } });
  }

  return {
    handle(action, args = {}) {
      const handler = handlers[action];
      return handler ? handler(args) : undefined;
    },
    // Text and number fields report through input events, not actions.
    input: (field, value) => setValue(field, value),
    register(extra) {
      Object.assign(handlers, extra);
    },
    run,
    confirmOr,
    has: (action) => Object.hasOwn(handlers, action),
  };
}
