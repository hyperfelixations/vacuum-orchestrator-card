// Every control's `data-action` ends here and becomes UI navigation or one integration command.
// Destructive commands pass through a confirmation page unless `confirm_destructive: false`.
// The router decides nothing about domain rules: the integration checks every form's input
// (`validate`) and answers every command; a refusal becomes this card's notice. See internal dev
// doc §9 "Aktionsvertrag".

import { CREATE_TARGET, QUEUE_TARGET, SETUP_TARGET, jobTarget, robotTarget, roomTarget, templateTarget, queueControl } from "../../domain/affordances.js";
import { applyDraftChange, createDraft, draftFieldOf, draftToIntent, draftToTemplate, draftToUpdatePatch, isDirty, toggleRoom } from "../../domain/job-draft.js";
import { createRoomDraft, isRoomDirty, newBinding, newRequirement, roomDraftToPatch, roomFieldOf, updateRoomDraft } from "../../domain/room-draft.js";
import { createRobotDraft, isRobotDirty, robotDraftToConfiguration, robotFieldOf, updateRobotDraft } from "../../domain/robot-draft.js";
import { formErrors, withoutFieldError } from "../../domain/validation.js";
import { AFTER_CANCEL_CHOICES, queueEndChoices } from "../../presentation/overlays/dialogs.js";
import { jobTitle, roomIndex } from "../../presentation/common/lookups.js";
import { SETTING_FIELDS, SETTING_WIRE_NAMES } from "../../domain/job-schema.js";

// Each editor overlay names the reducer of its draft and whether it holds unsaved changes.
const DRAFT_REDUCERS = Object.freeze({
  "job-editor": applyDraftChange,
  "room-editor": updateRoomDraft,
  "robot-editor": updateRobotDraft,
});
const DRAFT_DIRTY = Object.freeze({
  "job-editor": isDirty,
  "room-editor": isRoomDirty,
  "robot-editor": isRobotDirty,
});
// For pages that edit their values on the page itself (`overlay:<key>`): the field an error of the
// integration names by the command field it starts with.
const pageFields = (fields) => (path) => fields[String(path).split(".")[0]] ?? null;
const JOB_DEFAULT_FIELDS = Object.freeze({ mode: "overlay:mode", passes: "overlay:passes", settings_policy: "overlay:settingsPolicy", ...Object.fromEntries(SETTING_FIELDS.map((field) => [SETTING_WIRE_NAMES[field], `overlay:${field}`])) });
// One release on the page: its kind and its duration, edited as hours and minutes.
const RELEASE_FIELDS = Object.freeze({ "grants.0.kind": "overlay:releaseKind", "grants.0.duration_seconds": "overlay:duration" });
const releaseFieldOf = (path) => RELEASE_FIELDS[path] ?? null;
// Fields whose error belongs to a value they form together with others.
const FIELD_GROUPS = Object.freeze({ "overlay:hours": "overlay:duration", "overlay:minutes": "overlay:duration" });

const QUEUE_SCOPES = Object.freeze(["queue", "openJobs", "jobLog", "job", "execution", "trace"]);
const STARTED_STATES = Object.freeze(["dispatching", "running"]);
// The end of a queue run per choice; finishing is the integration's default.
const QUEUE_END = Object.freeze({
  finish: {},
  cancel_return: { running_jobs: "cancel", after_cancel: "return_to_dock" },
  cancel_stay: { running_jobs: "cancel", after_cancel: "stay" },
});
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

  // A form's command: the integration checks the input first; errors stay on the page at their
  // fields and nothing is sent. `fieldOf(path)` names the page's field for an error path.
  async function submit(operation, parameters, fieldOf, options) {
    const session = getSession();
    if (!session) return null;
    const page = ui.overlay;
    ui.setNotice(null);
    const verdict = await session.validate(operation, parameters);
    // The page changed meanwhile: what was checked is no longer what it shows.
    if (ui.overlay !== page) return null;
    if (!verdict?.ok) {
      ui.setNotice({ kind: "error", operation, failure: verdict });
      return verdict;
    }
    if (!verdict.data.valid) {
      ui.updateOverlay(formErrors(verdict.data, fieldOf));
      return null;
    }
    if (page?.errors || page?.formError) ui.updateOverlay({ errors: null, formError: null });
    return run(operation, parameters, options);
  }

  // A changed field drops the error the integration gave for it; the next attempt to send
  // checks again.
  function clearError(field) {
    const errors = ui.overlay?.errors;
    if (!errors) return;
    const next = [field, FIELD_GROUPS[field]].filter(Boolean).reduce(withoutFieldError, errors);
    if (next !== errors) ui.updateOverlay({ errors: Object.keys(next).length ? next : null });
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
    clearError(field);
  }

  // A field name addresses the draft; `overlay:<key>` addresses the page's own state (a dialog's
  // choice) and `query:<field>` the search text of an entity picker.
  function setValue(field, value) {
    if (typeof field !== "string") return;
    if (field.startsWith("overlay:")) {
      ui.updateOverlay({ [field.slice("overlay:".length)]: value });
      clearError(field);
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

  const jobDefaults = () => getModel()?.slots?.queue?.data?.jobDefaults ?? null;

  // `start`: create the job and start it at once; nothing is created if it cannot start.
  async function saveDraft({ start = false } = {}) {
    const overlay = ui.overlay;
    if (!overlay?.draft) return;
    const { kind, id } = overlay.draft.meta;
    const draft = overlay.draft;
    const fieldOf = (path) => draftFieldOf(draft, path);
    if (kind === "template") {
      await submit("save_template", draftToTemplate(draft), fieldOf, { target: id ? templateTarget(id) : CREATE_TARGET, invalidates: ["templates"], closeOverlay: true, success: { key: "notice.templateSaved" } });
    } else if (id) {
      const patch = draftToUpdatePatch(draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        return;
      }
      await submit("update_job", { job_id: id, ...patch }, fieldOf, { target: jobTarget(id), invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobUpdated" } });
    } else if (start) {
      await submit("create_job", { ...draftToIntent(draft), start: true }, fieldOf, { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobStarted" } });
    } else {
      await submit("create_job", draftToIntent(draft), fieldOf, { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobCreated" } });
    }
  }

  // The defaults dialog edits a copy of the integration's defaults on the page itself.
  function saveJobDefaults() {
    const overlay = ui.overlay;
    if (overlay?.kind !== "job-defaults") return null;
    const parameters = { mode: overlay.mode, passes: Number(overlay.passes), settings_policy: overlay.settingsPolicy };
    for (const field of SETTING_FIELDS) parameters[SETTING_WIRE_NAMES[field]] = overlay[field];
    return submit("configure_job_defaults", parameters, pageFields(JOB_DEFAULT_FIELDS), { target: QUEUE_TARGET, invalidates: ["queue"], closeOverlay: true, success: { key: "notice.jobDefaultsSaved" } });
  }

  const handlers = {
    navigate: ({ path }) => platform.navigate?.(path),
    "dismiss-notice": () => ui.setNotice(null),
    reload: () => getSession()?.probe(),
    // Leaving an editor with unsaved changes asks first, like any other destructive step.
    back: () => {
      const top = ui.overlay;
      const dirty = DRAFT_DIRTY[top?.kind];
      if (top?.draft && dirty?.(top.draft) && getConfig()?.confirm_destructive !== false) {
        ui.openOverlay({ kind: "confirm", titleKey: "confirm.discard.title", textKey: "confirm.discard.text", confirmKey: "confirm.discard.confirm", icon: "mdi:close", command: { discard: true } });
        return;
      }
      ui.closeOverlay();
    },
    toggle: ({ key }) => ui.toggle(key),
    choose: ({ key, value }) => ui.choose(key, value),
    "show-view": ({ view }) => ui.setView(view),
    "open-setup": () => ui.openOverlay({ kind: "setup-guide" }),
    "complete-setup": () => run("complete_setup", {}, { target: SETUP_TARGET, invalidates: ["setup"], closeOverlay: ui.overlay?.kind === "setup-guide" }),
    page: ({ scope, direction }) => {
      const model = getModel();
      const data = model?.slots?.[scope]?.data;
      const limit = data?.limit || getConfig()?.page_size || 25;
      const offset = data?.offset ?? 0;
      ui.setPage(scope, direction === "previous" ? offset - limit : offset + limit);
    },

    "queue-control": () => {
      const control = queueControl(getModel()?.slots?.queue?.data?.actions);
      return control ? run(control.operation, {}, { target: QUEUE_TARGET, invalidates: ["queue", "openJobs"] }) : null;
    },
    "open-job": ({ jobId }) => ui.openOverlay({ kind: "job-detail", jobId }),
    "create-job": ({ roomIds = null } = {}) => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", defaults: roomIds ? { roomIds } : {}, jobDefaults: jobDefaults() }) }),
    "edit-job": ({ jobId }) => {
      const job = findJob(getModel(), jobId);
      if (job) ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", target: job, jobDefaults: jobDefaults() }) });
    },
    "open-save-template": ({ jobId }) => {
      const model = getModel();
      const job = findJob(model, jobId);
      if (job) ui.openOverlay({ kind: "save-template", jobId, name: jobTitle(job, roomIndex(model), model), automatic: false });
    },
    "save-job-template": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "save-template") return null;
      const parameters = { job_id: overlay.jobId, name: String(overlay.name ?? "").trim(), automatic: overlay.automatic === true };
      return submit("save_job_as_template", parameters, pageFields({ name: "overlay:name", automatic: "overlay:automatic" }), { target: jobTarget(overlay.jobId), invalidates: ["templates"], closeOverlay: true, success: { key: "notice.templateSavedFromJob" } });
    },
    "open-job-defaults": () => {
      const defaults = jobDefaults();
      if (defaults) ui.openOverlay({ kind: "job-defaults", mode: defaults.mode, vacuumPower: defaults.vacuumPower, mopIntensity: defaults.mopIntensity, mopRoute: defaults.mopRoute, passes: defaults.passes, settingsPolicy: defaults.settingsPolicy });
    },
    "save-job-defaults": () => saveJobDefaults(),
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
      if (overlay?.kind === "job-editor" && field === "roomIds") {
        ui.updateOverlay({ draft: toggleRoom(overlay.draft, value) });
        clearError("roomIds");
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
    "start-draft": () => saveDraft({ start: true }),
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
    // A started job asks what its robot does next; a waiting one is only withdrawn. Without the
    // question the integration's default applies: the robot stays.
    "cancel-job": ({ jobId }) => {
      const command = { operation: "cancel_job", parameters: { job_id: jobId }, options: { target: jobTarget(jobId), invalidates: QUEUE_SCOPES } };
      const started = STARTED_STATES.includes(findJob(getModel(), jobId)?.state);
      const returns = (getModel()?.slots?.robots?.data?.items || []).some((robot) => robot.capabilities?.supports?.returnToDock === true);
      if (!started || !returns || getConfig()?.confirm_destructive === false) {
        return confirmOr(command, { titleKey: "confirm.cancelJob.title", textKey: "confirm.cancelJob.text", confirmKey: "confirm.cancelJob.confirm", icon: "mdi:stop-circle-outline", jobId });
      }
      ui.openOverlay({ kind: "cancel-job", jobId, afterCancel: AFTER_CANCEL_CHOICES[0] });
      return null;
    },
    "confirm-cancel": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "cancel-job" || !AFTER_CANCEL_CHOICES.includes(overlay.afterCancel)) return null;
      ui.closeOverlay();
      return run("cancel_job", { job_id: overlay.jobId, after_cancel: overlay.afterCancel }, { target: jobTarget(overlay.jobId), invalidates: QUEUE_SCOPES });
    },
    // Ending asks how started jobs end; without any it only confirms.
    "end-queue": () => {
      const command = { operation: "end_queue", parameters: {}, options: { target: QUEUE_TARGET, invalidates: QUEUE_SCOPES } };
      const started = (getModel()?.slots?.openJobs?.data?.jobs || []).some((job) => STARTED_STATES.includes(job.state));
      if (!started || getConfig()?.confirm_destructive === false) {
        return confirmOr(command, { titleKey: "confirm.endQueue.title", textKey: "confirm.endQueue.text", confirmKey: "confirm.endQueue.confirm", icon: "mdi:stop", tone: "primary" });
      }
      ui.openOverlay({ kind: "queue-end", choice: "finish" });
      return null;
    },
    "confirm-end-queue": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "queue-end" || !queueEndChoices(getModel()).includes(overlay.choice)) return null;
      ui.closeOverlay();
      return run("end_queue", QUEUE_END[overlay.choice], { target: QUEUE_TARGET, invalidates: QUEUE_SCOPES });
    },
    "return-robot": ({ robotId }) => run("return_robot", { robot_id: robotId }, { target: robotTarget(robotId), invalidates: ["robots"], success: { key: "notice.robotReturning" } }),
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
    "create-template": () => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template", jobDefaults: jobDefaults() }) }),
    "edit-template": ({ templateId }) => {
      const template = findIn(getModel(), "templates", "templateId", templateId);
      if (template) ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "template", target: template, jobDefaults: jobDefaults() }) });
    },
    "remove-template": ({ templateId }) => confirmOr(
      { operation: "remove_template", parameters: { template_id: templateId }, options: { target: templateTarget(templateId), invalidates: ["templates"], closeOverlay: ui.overlay?.kind === "job-editor", success: { key: "notice.templateRemoved" } } },
      { titleKey: "confirm.removeTemplate.title", textKey: "confirm.removeTemplate.text", confirmKey: "confirm.removeTemplate.confirm", icon: "mdi:delete-outline", vars: { template: findIn(getModel(), "templates", "templateId", templateId)?.name ?? "" } }
    ),
    "reset-template-demand": ({ templateId }) => run("reset_template_demand", { template_id: templateId }, { target: templateTarget(templateId), invalidates: ["templates"], success: { key: "notice.templateDemandReset" } }),
    "open-release": ({ roomId }) => ui.openOverlay({ kind: "release", roomId, releaseKind: "queue_run", hours: 2, minutes: 0 }),
    "release-room": ({ roomId }) => releaseRoom(roomId, ui.overlay?.kind === "release" ? ui.overlay : null),
    "revoke-room": ({ roomId, close = false }) => run("revoke_rooms", { rooms: [roomId] }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: close, success: { key: "notice.roomLocked" } }),
    "edit-room": ({ roomId }) => {
      const room = findRoom(roomId);
      if (room) ui.openOverlay({ kind: "room-editor", draft: createRoomDraft(room) });
    },
    "save-room": async () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "room-editor") return null;
      const patch = roomDraftToPatch(overlay.draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        return null;
      }
      const roomId = overlay.draft.meta.roomId;
      return submit("update_room", { room_id: roomId, configuration: patch }, roomFieldOf, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomSaved" } });
    },
    "remove-requirement": ({ index }) => editDraft("requirements", ui.overlay.draft.requirements.filter((_item, position) => position !== index)),
    "add-binding": ({ robotId }) => {
      ui.updateOverlay({ draft: updateRoomDraft(ui.overlay.draft, "bindings", [...ui.overlay.draft.bindings, newBinding(robotId)]), bindingsOpen: true });
      clearError("bindings");
    },
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
      const parameters = overlay?.areaId ? { name, area_id: overlay.areaId } : { name };
      return submit("create_room", parameters, pageFields({ name: "overlay:name", area_id: "overlay:areaId" }), { target: CREATE_TARGET, invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomCreated" } });
    },
    "add-robot": () => ui.openOverlay({ kind: "robot-add" }),
    "add-candidate": ({ entityId }) => run("add_robot", { entity_id: entityId }, { target: CREATE_TARGET, invalidates: ROBOT_SCOPES, closeOverlay: ui.overlay?.kind === "robot-add", success: { key: "notice.robotAdded" } }),
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
      const robotId = overlay.draft.meta.robotId;
      return submit("configure_robot", { robot_id: robotId, configuration: robotDraftToConfiguration(overlay.draft) }, robotFieldOf, { target: robotTarget(robotId), invalidates: ROBOT_SCOPES, closeOverlay: true, success: { key: "notice.robotSaved" } });
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
      if (ui.overlay?.kind !== "queue-settings") return null;
      return submit("configure_queue", { grace_seconds: Number(ui.overlay.minutes) * 60 }, pageFields({ grace_seconds: "overlay:minutes" }), { target: QUEUE_TARGET, invalidates: ["queue"], closeOverlay: true, success: { key: "notice.queueSettingsSaved" } });
    },
    "open-recovery": ({ robotId }) => ui.openOverlay({ kind: "recovery", robotId, confirmStopped: false }),
    "set-overlay": (patch) => ui.updateOverlay(patch),
    "resolve-recovery": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "recovery") return null;
      return run("resolve_recovery", { robot_id: overlay.robotId, confirm_stopped: overlay.confirmStopped === true }, { target: robotTarget(overlay.robotId), closeOverlay: true, success: { key: "notice.recoveryResolved" } });
    },
  };

  // From the release page with its kind and duration; from a room card at once until the queue
  // run ends, which asks nothing.
  function releaseRoom(roomId, overlay) {
    const options = { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: Boolean(overlay), success: { key: "notice.roomReleased" } };
    if (!overlay) return run("release_rooms", { grants: [{ room: roomId, kind: "queue_run" }] }, options);
    const grant = { room: roomId, kind: overlay.releaseKind || "queue_run" };
    if (grant.kind === "timed") grant.duration_seconds = (Number(overlay.hours ?? 2) * 60 + Number(overlay.minutes ?? 0)) * 60;
    return submit("release_rooms", { grants: [grant] }, releaseFieldOf, options);
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
