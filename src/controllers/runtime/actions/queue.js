// The queue: its run control, ending a run, its settings and the defaults for new jobs. See
// internal dev doc §9 "Aktionsvertrag".

import { QUEUE_TARGET, queueControl } from "../../../domain/affordances.js";
import { SETTING_FIELDS, SETTING_WIRE_NAMES } from "../../../domain/job-schema.js";
import { queueEndChoices } from "../../../presentation/overlays/dialogs.js";
import { own } from "../../../core/lookup.js";
import { QUEUE_SCOPES, STARTED_STATES, jobDefaults, pageFields } from "./shared.js";

// The end of a queue run per choice; finishing is the integration's default.
const QUEUE_END = Object.freeze({
  finish: {},
  cancel_return: { running_jobs: "cancel", after_cancel: "return_to_dock" },
  cancel_stay: { running_jobs: "cancel", after_cancel: "stay" },
});
const JOB_DEFAULT_FIELDS = Object.freeze({ mode: "overlay:mode", passes: "overlay:passes", settings_policy: "overlay:settingsPolicy", ...Object.fromEntries(SETTING_FIELDS.map((field) => [SETTING_WIRE_NAMES[field], `overlay:${field}`])) });

export function queueActions({ ui, getModel, getConfig, lifecycle }) {
  const { run, submit, confirmOr } = lifecycle;
  return {
    "queue-control": () => {
      const control = queueControl(getModel()?.slots?.queue?.data?.actions);
      return control ? run(control.operation, {}, { target: QUEUE_TARGET, invalidates: ["queue", "openJobs"] }) : null;
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
      return run("end_queue", own(QUEUE_END, overlay.choice), { target: QUEUE_TARGET, invalidates: QUEUE_SCOPES, closeOverlay: true });
    },
    "open-queue-settings": () => {
      const queue = getModel()?.slots?.queue?.data;
      if (!Number.isFinite(queue?.graceSeconds)) return;
      const values = { minutes: Math.round(queue.graceSeconds / 60), delay: Number.isFinite(queue.startDelaySeconds) ? queue.startDelaySeconds : null };
      ui.openOverlay({ kind: "queue-settings", ...values, initial: values });
    },
    // Only what changed travels; nothing changed closes the dialog.
    "save-queue-settings": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "queue-settings") return null;
      const parameters = {};
      if (String(overlay.minutes) !== String(overlay.initial?.minutes)) parameters.grace_seconds = Number(overlay.minutes) * 60;
      if (String(overlay.delay ?? "") !== String(overlay.initial?.delay ?? "")) parameters.start_delay_seconds = Number(overlay.delay);
      if (!Object.keys(parameters).length) {
        ui.closeOverlay();
        return null;
      }
      return submit("configure_queue", parameters, pageFields({ grace_seconds: "overlay:minutes", start_delay_seconds: "overlay:delay" }), { target: QUEUE_TARGET, invalidates: ["queue"], closeOverlay: true, success: { key: "notice.queueSettingsSaved" } });
    },
    "open-job-defaults": () => {
      const defaults = jobDefaults(getModel());
      if (defaults) ui.openOverlay({ kind: "job-defaults", mode: defaults.mode, vacuumPower: defaults.vacuumPower, mopIntensity: defaults.mopIntensity, mopRoute: defaults.mopRoute, passes: defaults.passes, settingsPolicy: defaults.settingsPolicy });
    },
    // The defaults dialog edits a copy of the integration's defaults on the page itself.
    "save-job-defaults": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "job-defaults") return null;
      const parameters = { mode: overlay.mode, passes: Number(overlay.passes), settings_policy: overlay.settingsPolicy };
      for (const field of SETTING_FIELDS) parameters[SETTING_WIRE_NAMES[field]] = overlay[field];
      return submit("configure_job_defaults", parameters, pageFields(JOB_DEFAULT_FIELDS), { target: QUEUE_TARGET, invalidates: ["queue"], closeOverlay: true, success: { key: "notice.jobDefaultsSaved" } });
    },
  };
}
