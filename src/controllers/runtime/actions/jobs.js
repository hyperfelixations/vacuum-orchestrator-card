// Jobs: their detail, editor and templates made from them, starting, moving, cancelling, deleting,
// correcting and retrying them. See internal dev doc §9 "Aktionsvertrag".

import { CREATE_TARGET, jobTarget, templateTarget } from "../../../domain/affordances.js";
import { createDraft, draftFieldOf, draftToIntent, draftToTemplate, draftToUpdatePatch } from "../../../domain/job-draft.js";
import { AFTER_CANCEL_CHOICES, CORRECTION_OUTCOMES } from "../../../presentation/overlays/dialogs.js";
import { jobTitle, roomIndex, roomName } from "../../../presentation/common/lookups.js";
import { ALL, QUEUE_SCOPES, STARTED_STATES, findJob, jobDefaults, pageFields } from "./shared.js";

export function jobActions({ ui, getModel, getConfig, getView, platform, lifecycle, holds }) {
  const { run, submit, confirmOr, confirmLowBattery } = lifecycle;

  // The robot a start of `jobId` would take below its battery minimum, as the integration names
  // it; null when it names none (JOB-27).
  function lowBatteryRobot(jobId, robotId) {
    const start = findJob(getModel(), jobId)?.actions?.start;
    if (start?.warning !== "battery_low") return null;
    return robotId ? (start.robotIds.includes(robotId) ? robotId : null) : start.robotIds[0] ?? null;
  }

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
      // Nothing changed: giving the hold back has the effect saving would have.
      const patch = draftToUpdatePatch(draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        if (overlay.holdId) holds.releaseHold(overlay.holdId);
        return;
      }
      const parameters = { job_id: id, ...(overlay.holdId ? { hold_id: overlay.holdId } : {}), ...patch };
      const result = await submit("update_job", parameters, fieldOf, { target: jobTarget(id), invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobUpdated" } });
      if (result?.code === "hold_expired" && ui.find(overlay.id)) ui.patchOverlay(overlay.id, { holdId: null, holdLost: true, holdFailure: null });
    } else if (start) {
      await submit("create_job", { ...draftToIntent(draft), start: true }, fieldOf, { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobStarted" } });
    } else {
      await submit("create_job", draftToIntent(draft), fieldOf, { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobCreated" } });
    }
  }

  return {
    // A wide queue shows the job beside its list (LAY-03); anywhere else the job opens as a page.
    "open-job": ({ jobId }) => (ui.snapshot.wide && !ui.overlay && getView() === "queue" ? ui.selectJob(jobId) : ui.openOverlay({ kind: "job-detail", jobId })),
    "create-job": ({ roomIds = null } = {}) => ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", defaults: roomIds ? { roomIds } : {}, jobDefaults: jobDefaults(getModel()) }) }),
    "edit-job": ({ jobId }) => {
      const job = findJob(getModel(), jobId);
      if (!job) return null;
      const waiting = job.state === "queued";
      ui.openOverlay({ kind: "job-editor", draft: createDraft({ kind: "job", target: job, jobDefaults: jobDefaults(getModel()) }), busy: waiting });
      return waiting ? holds.holdForEditing(ui.overlay.id, jobId, { first: true }) : null;
    },
    "hold-again": () => {
      const editor = ui.overlay;
      if (editor?.kind !== "job-editor" || !editor.draft?.meta.id) return null;
      ui.patchOverlay(editor.id, { busy: true });
      return holds.holdForEditing(editor.id, editor.draft.meta.id);
    },
    // A job that started or ended while its hold had lapsed: the draft becomes a new job.
    "save-as-new-job": () => {
      const editor = ui.overlay;
      if (editor?.kind !== "job-editor" || !editor.draft) return null;
      return submit("create_job", draftToIntent(editor.draft), (path) => draftFieldOf(editor.draft, path), { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true, success: { key: "notice.jobCreated" } });
    },
    "open-save-template": ({ jobId }) => {
      const model = getModel();
      const job = findJob(model, jobId);
      if (job) ui.openOverlay({ kind: "save-template", jobId, name: jobTitle(job, roomIndex(model), model), automatic: false });
    },
    // JOB-24: the editor's draft as it is shown, named after its title or rooms; the editor stays
    // open with it and keeps its hold.
    "open-save-draft-template": () => {
      const editor = ui.overlay;
      if (editor?.kind !== "job-editor" || editor.draft?.meta.kind !== "job") return;
      const { draft } = editor;
      const model = getModel();
      const index = roomIndex(model);
      const rooms = draft.allRooms ? [] : (draft.roomIds ?? []).map((roomId) => roomName(roomId, index, model));
      ui.openOverlay({ kind: "save-template", editorId: editor.id, name: String(draft.name ?? "").trim() || rooms.join(", "), automatic: false });
    },
    "save-job-template": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "save-template") return null;
      const fieldOf = pageFields({ name: "overlay:name", automatic: "overlay:automatic" });
      if (overlay.editorId) {
        const draft = ui.find(overlay.editorId)?.draft;
        if (!draft) return null;
        // The occasion belongs to the job, not to what it repeats.
        const { reason: _reason, ...intent } = draftToIntent(draft);
        const parameters = { name: String(overlay.name ?? "").trim(), intent, enabled: true, automatic: overlay.automatic === true };
        return submit("save_template", parameters, fieldOf, { target: CREATE_TARGET, invalidates: ["templates"], closeOverlay: true, success: { key: "notice.templateSaved" } });
      }
      const parameters = { job_id: overlay.jobId, name: String(overlay.name ?? "").trim(), automatic: overlay.automatic === true };
      return submit("save_job_as_template", parameters, fieldOf, { target: jobTarget(overlay.jobId), invalidates: ["templates"], closeOverlay: true, success: { key: "notice.templateSavedFromJob" } });
    },
    "save-draft": () => saveDraft(),
    // Below a robot's battery minimum the start asks first, then creates the job anyway (JOB-27).
    "start-draft": ({ lowBattery = false } = {}) => {
      const draft = ui.overlay?.draft;
      if (!lowBattery || !draft) return saveDraft({ start: true });
      const robotId = (getModel()?.slots?.preview?.data?.robots || []).find((item) => item.reason === "battery_below_minimum")?.robotId ?? null;
      confirmLowBattery(robotId, { operation: "create_job", parameters: { ...draftToIntent(draft), start: true, allow_low_battery: true }, options: { target: CREATE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: 2, success: { key: "notice.jobStarted" } } });
      return null;
    },
    "move-job": ({ jobId, direction }) => run("move_job", { job_id: jobId, direction }, { target: jobTarget(jobId), invalidates: ["queue"] }),
    "start-job": ({ jobId, robotId = null, choose = true }) => {
      const robots = getModel()?.slots?.robots?.data?.items || [];
      if (choose && robots.length > 1 && !robotId) {
        ui.openOverlay({ kind: "start-job", jobId });
        return null;
      }
      const parameters = robotId ? { job_id: jobId, robot_id: robotId } : { job_id: jobId };
      const options = { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, closeOverlay: ui.overlay?.kind === "start-job", success: { key: "notice.jobStarted" } };
      // A robot below its battery minimum starts only once the person said so (JOB-27).
      const low = lowBatteryRobot(jobId, robotId);
      if (low) {
        confirmLowBattery(low, { operation: "start_job", parameters: { ...parameters, allow_low_battery: true }, options: { ...options, closeOverlay: ui.overlay?.kind === "start-job" ? 2 : 1 } });
        return null;
      }
      return run("start_job", parameters, options);
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
    // Deleting from the detail page or the editor leaves every page: they all showed that job. A
    // waiting job is held while its deletion is confirmed.
    "delete-job": ({ jobId }) => {
      const result = confirmOr(
        { operation: "delete_job", parameters: { job_id: jobId }, options: { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, closeOverlay: ["job-detail", "job-editor"].includes(ui.overlay?.kind) ? ALL : false } },
        { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", icon: "mdi:delete-outline", jobId }
      );
      const below = ui.snapshot.overlays.at(-2);
      if (ui.overlay?.kind === "confirm" && below?.kind === "job-editor" && below.holdId) {
        // The editor's hold covers its deletion; leaving the question keeps it with the editor.
        ui.patchOverlay(ui.overlay.id, { holdId: below.holdId, sharedHold: true });
        return result;
      }
      if (ui.overlay?.kind === "confirm" && findJob(getModel(), jobId)?.state === "queued") return holds.holdForDeletion(ui.overlay.id, jobId);
      return result;
    },
    // DIA-06: the job's log as the integration gave it, its incidents included.
    "save-trace": ({ jobId }) => {
      const answer = getModel()?.slots?.trace?.data?.answer;
      if (answer) platform.download?.(`vacuum-orchestrator-job-${jobId}.json`, JSON.stringify(answer, null, 2), "application/json");
    },
    // JOB-25: a correction changes the rooms' cleaning record, so their due dates and the runs.
    "correct-job": ({ jobId }) => {
      const job = findJob(getModel(), jobId);
      if (job) ui.openOverlay({ kind: "correct-job", jobId, outcome: job.state === "completed" ? "failed" : "completed" });
    },
    "confirm-correct": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "correct-job" || !CORRECTION_OUTCOMES.includes(overlay.outcome)) return null;
      return run("correct_job", { job_id: overlay.jobId, outcome: overlay.outcome }, { target: jobTarget(overlay.jobId), invalidates: [...QUEUE_SCOPES, "rooms", "runs"], closeOverlay: true, success: { key: "notice.jobCorrected" } });
    },
    "retry-job": ({ jobId }) => run("retry_job", { job_id: jobId }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES, success: { key: "notice.jobRetried" } }),
  };
}
