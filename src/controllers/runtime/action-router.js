// Every control's `data-action` ends here and becomes UI navigation or one integration command.
// Destructive commands pass through a confirmation dialog unless `confirm_destructive: false`.
// The router decides nothing about domain rules: the integration checks every form's input
// (`validate`) and answers every command; a refusal becomes this card's notice, or the dialog's
// own message. A command belongs to the page or dialog it was sent from, which waits for the
// answer. See internal dev doc §9 "Aktionsvertrag" and "Command-Lebenszyklus".

import { CREATE_TARGET, QUEUE_TARGET, SETUP_TARGET, jobTarget, robotTarget, roomTarget, templateTarget, queueControl } from "../../domain/affordances.js";
import { applyDraftChange, createDraft, draftFieldOf, draftToIntent, draftToTemplate, draftToUpdatePatch, isDirty, toggleRoom } from "../../domain/job-draft.js";
import { createRoomDraft, isRoomDirty, newBinding, newRequirement, roomDraftToPatch, roomFieldOf, updateRoomDraft } from "../../domain/room-draft.js";
import { createRobotDraft, isRobotDirty, robotDraftToConfiguration, robotFieldOf, updateRobotDraft } from "../../domain/robot-draft.js";
import { formErrors, withoutFieldError } from "../../domain/validation.js";
import { grantsOf, releaseField, releaseFieldOf, releaseGroupOf, releaseRows, updateReleaseRow, withReleaseRoom, withoutReleaseRow } from "../../domain/release-draft.js";
import { isTransportFailure } from "../../domain/backend-errors.js";
import { AFTER_CANCEL_CHOICES, queueEndChoices } from "../../presentation/overlays/dialogs.js";
import { jobTitle, roomIndex } from "../../presentation/common/lookups.js";
import { SETTING_FIELDS, SETTING_WIRE_NAMES } from "../../domain/job-schema.js";
import { menuId } from "../../views/controls/menu.js";

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
// What a person can still do while the page or dialog on top waits for its command's answer.
const WHILE_BUSY = new Set(["dismiss-notice", "navigate"]);

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

// `isDialog(kind)`: whether an overlay is a card dialog, which shows a failure itself.
// `getView`: the view on screen, which the tab row resolves when the card has not chosen one.
export function createActionRouter({ ui, getSession, getModel, getConfig, platform, isDialog = () => false, getView = () => ui.snapshot.view }) {
  // A command and its answer (UI-16, UI-17). The page or dialog on top when it is sent is its
  // origin: it is busy until the answer and, on success, leaves with `closeOverlay` layers (true
  // one, a number that many, "all" every page) only while it is still on top. A refusal stays in
  // a dialog origin, else it becomes the card's notice; without an answer the result is unknown,
  // the session reloads and nothing is sent again.
  async function run(operation, parameters, { target = operation, invalidates = ALL, success = null, closeOverlay = false } = {}) {
    const session = getSession();
    if (!session) return null;
    const origin = ui.overlay;
    ui.setNotice(null);
    if (origin) ui.patchOverlay(origin.id, { busy: true, failure: null });
    const result = await session.command(operation, parameters, { target, invalidates });
    const open = origin ? ui.find(origin.id) : null;
    if (open) ui.patchOverlay(origin.id, { busy: false });
    const onTop = Boolean(open) && ui.overlay.id === origin.id;
    if (result?.ok) {
      if (onTop && closeOverlay === ALL) ui.closeAllOverlays();
      else if (onTop && closeOverlay) ui.closeOverlay(closeOverlay === true ? 1 : closeOverlay);
      if (success) ui.setNotice({ kind: "success", messageKey: success.key, vars: success.vars || null });
    } else if (result) {
      if (open && isDialog(origin.kind)) ui.patchOverlay(origin.id, { failure: result });
      else if (isTransportFailure(result)) ui.setNotice({ kind: "warning", messageKey: "notice.outcomeUnknown" });
      else ui.setNotice({ kind: "error", operation, failure: result });
      if (onTop) ui.requestFocus(isDialog(origin.kind) ? "#voc-dialog-title" : "#voc-overlay-title");
    }
    return result;
  }

  // A waiting job's deletion is confirmed under a hold, so it cannot start meanwhile (JOB-22).
  // The dialog owns the hold: it sends `hold_id` with the deletion and releases the hold when it
  // is left without deleting, which restarts the start delay (QUE-11). A hold that arrives after
  // the dialog is gone is released at once.
  async function holdForDeletion(dialogId, jobId) {
    const result = await getSession()?.command("hold_job", { job_id: jobId, purpose: "confirm" }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES });
    if (!result) return;
    if (!ui.find(dialogId)) {
      if (result.ok) releaseHold(result.data.hold_id);
    } else if (result.ok) ui.patchOverlay(dialogId, { holdId: result.data.hold_id });
    else ui.patchOverlay(dialogId, { failure: result });
  }

  // A release has nothing to show: if it fails, the hold ends with its lease. It has a target of
  // its own, so the job's controls stay usable meanwhile and focus can return to them.
  function releaseHold(holdId) {
    void getSession()?.command("release_job_hold", { hold_id: holdId }, { target: `hold:${holdId}`, invalidates: QUEUE_SCOPES });
  }

  // A form's command: the integration checks the input first; errors stay on the page at their
  // fields and nothing is sent. `fieldOf(path)` names the page's field for an error path. The page
  // is busy from the check on.
  async function submit(operation, parameters, fieldOf, options) {
    const session = getSession();
    if (!session) return null;
    const page = ui.overlay;
    ui.setNotice(null);
    if (page) ui.patchOverlay(page.id, { busy: true });
    const verdict = await session.validate(operation, parameters);
    if (page) ui.patchOverlay(page.id, { busy: false });
    // The page left meanwhile: what was checked is no longer shown.
    if (ui.overlay?.id !== page?.id) return null;
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
    // A field whose error belongs to a value it forms together with others clears that too.
    const next = [field, releaseGroupOf(field)].filter(Boolean).reduce(withoutFieldError, errors);
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
    const row = releaseField(field);
    if (row && ui.overlay?.kind === "release") {
      ui.updateOverlay({ rooms: updateReleaseRow(ui.overlay.rooms, row.index, row.name, value) });
      clearError(field);
      return;
    }
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
    // Leaving an editor with unsaved changes asks first, like any other destructive step. Leaving
    // a deletion's dialog gives its hold back.
    back: () => {
      const top = ui.overlay;
      const dirty = DRAFT_DIRTY[top?.kind];
      if (top?.draft && dirty?.(top.draft) && getConfig()?.confirm_destructive !== false) {
        ui.openOverlay({ kind: "confirm", titleKey: "confirm.discard.title", textKey: "confirm.discard.text", confirmKey: "confirm.discard.confirm", icon: "mdi:close", command: { discard: true } });
        return;
      }
      ui.closeOverlay();
      if (top?.holdId) releaseHold(top.holdId);
    },
    toggle: ({ key }) => ui.toggle(key),
    // A menu opens with focus on its first item (or its last, from ArrowUp) and closes with focus
    // back on its button (WAI-ARIA APG "Menu Button").
    "toggle-menu": ({ key, focus = "first" }) => {
      if (ui.snapshot.menu === key) {
        ui.requestFocus(`[data-key="menu:${key}"] .voc-menu-button`);
        ui.setMenu(null);
        return;
      }
      ui.requestFocus(`#${menuId(key)} [role="menuitem"]${focus === "last" ? ":last-of-type" : ""}`);
      ui.setMenu(key);
    },
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
    // A wide queue shows the job beside its list (LAY-03); anywhere else the job opens as a page.
    "open-job": ({ jobId }) => (ui.snapshot.wide && !ui.overlay && getView() === "queue" ? ui.selectJob(jobId) : ui.openOverlay({ kind: "job-detail", jobId })),
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
      return run("cancel_job", { job_id: overlay.jobId, after_cancel: overlay.afterCancel }, { target: jobTarget(overlay.jobId), invalidates: QUEUE_SCOPES, closeOverlay: true });
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
      return run("end_queue", QUEUE_END[overlay.choice], { target: QUEUE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true });
    },
    "return-robot": ({ robotId }) => run("return_robot", { robot_id: robotId }, { target: robotTarget(robotId), invalidates: ["robots"], success: { key: "notice.robotReturning" } }),
    // Deleting from the detail page or the editor leaves every page: they all showed that job. A
    // waiting job is held while its deletion is confirmed.
    "delete-job": ({ jobId }) => {
      const result = confirmOr(
        { operation: "delete_job", parameters: { job_id: jobId }, options: { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, closeOverlay: ["job-detail", "job-editor"].includes(ui.overlay?.kind) ? ALL : false } },
        { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", icon: "mdi:delete-outline", jobId }
      );
      if (ui.overlay?.kind === "confirm" && findJob(getModel(), jobId)?.state === "queued") return holdForDeletion(ui.overlay.id, jobId);
      return result;
    },
    "retry-job": ({ jobId }) => run("retry_job", { job_id: jobId }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, success: { key: "notice.jobRetried" } }),
    // The confirmation waits for the answer and then leaves with what its command closes (the
    // page it interrupted, or every page); a discard leaves that page at once. A deletion whose
    // hold has lapsed asks again under a new hold, beside the integration's reason.
    "confirm-command": async () => {
      const dialog = ui.overlay;
      const command = dialog?.command;
      if (!command) return null;
      if (command.discard) {
        ui.closeOverlay(2);
        return null;
      }
      const closes = command.options?.closeOverlay;
      const parameters = dialog.holdId ? { ...command.parameters, hold_id: dialog.holdId } : command.parameters;
      const result = await run(command.operation, parameters, { ...command.options, closeOverlay: closes === ALL ? ALL : closes ? 2 : 1 });
      if (result?.code === "hold_expired" && ui.find(dialog.id)) {
        ui.patchOverlay(dialog.id, { holdId: null });
        await holdForDeletion(dialog.id, dialog.jobId);
      }
      return result;
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
    "open-release": ({ roomId, roomIds }) => ui.openOverlay({ kind: "release", rooms: releaseRows(roomIds?.length ? roomIds : [roomId]) }),
    "add-release-room": ({ roomId }) => {
      if (ui.overlay?.kind === "release") ui.updateOverlay({ rooms: withReleaseRoom(ui.overlay.rooms, roomId) });
    },
    // Rows after the removed one move up, so the errors the integration named by row go.
    "remove-release-room": ({ index }) => {
      if (ui.overlay?.kind === "release") ui.updateOverlay({ rooms: withoutReleaseRow(ui.overlay.rooms, index), errors: null, formError: null });
    },
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
      { titleKey: "confirm.disableRoom.title", textKey: "confirm.disableRoom.text", confirmKey: "confirm.disableRoom.confirm", icon: "mdi:eye-off-outline", tone: "primary", vars: { room: findRoom(roomId)?.name ?? "" } }
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

  // From the release dialog every listed room with its own kind in one command; from a room card
  // at once until the queue run ends, which asks nothing.
  function releaseRoom(roomId, overlay) {
    if (!overlay) return run("release_rooms", { grants: [{ room: roomId, kind: "queue_run" }] }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, success: { key: "notice.roomReleased" } });
    const rows = overlay.rooms || [];
    const one = rows.length === 1;
    return submit("release_rooms", { grants: grantsOf(rows) }, releaseFieldOf, { target: one ? roomTarget(rows[0].roomId) : "release_rooms", invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: one ? "notice.roomReleased" : "notice.roomsReleased" } });
  }

  return {
    handle(action, args = {}) {
      const handler = handlers[action];
      if (!handler || (ui.overlay?.busy && !WHILE_BUSY.has(action))) return undefined;
      // Choosing anything, a menu item included, closes an open menu.
      if (action !== "toggle-menu" && ui.snapshot.menu) ui.setMenu(null);
      return handler(args);
    },
    // Text and number fields report through input events, not actions.
    input: (field, value) => {
      if (!ui.overlay?.busy) setValue(field, value);
    },
    register(extra) {
      Object.assign(handlers, extra);
    },
    run,
    confirmOr,
    has: (action) => Object.hasOwn(handlers, action),
  };
}
