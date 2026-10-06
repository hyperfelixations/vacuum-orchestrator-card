// Two small pages around job intents: saving a job as a template, and the integration's
// defaults for new jobs. Each edits its values on the page itself and sends one command.
// See internal dev doc §8 "Vorgaben" and "Auftragsdetail".

import { QUEUE_TARGET, decide, jobTarget } from "../../domain/affordances.js";
import { CLEANING_MODES, PASS_MAX, PASS_MIN, SETTING_FIELDS, SETTING_LADDERS, SETTINGS_POLICIES } from "../../domain/job-schema.js";
import { findJob, list, roomIndex, jobTitle } from "../common/lookups.js";
import { modeLabel, policyLabel, settingLabel, t } from "../common/texts.js";
import { MODE_ICONS } from "../views/job-row.js";
import { field } from "./editor-fields.js";

export function buildSaveTemplate({ model, texts, context, overlay }) {
  const job = findJob(model, overlay.jobId);
  const name = String(overlay.name ?? "");
  const target = jobTarget(overlay.jobId);
  return {
    key: "save-template",
    title: t(texts, "saveTemplate.title"),
    lead: t(texts, "saveTemplate.lead"),
    job: job ? jobTitle(job, roomIndex(model), model) : null,
    fields: [
      field(texts, { key: "overlay:name", labelKey: "saveTemplate.name", control: "text", value: name, required: true, error: overlay.submitted && !name.trim() ? t(texts, "validation.template_name_required") : null }),
      field(texts, { key: "overlay:automatic", labelKey: "saveTemplate.automatic", control: "switch", value: overlay.automatic === true, switchLabel: t(texts, "saveTemplate.automaticSwitch"), hintKey: "field.automaticHint" }),
    ],
    save: decide(context, { operation: "save_job_as_template", target }),
    pending: list(model.pending).includes(target),
  };
}

// Every setting is shown whatever the mode: a default serves any mode that uses it.
export function buildJobDefaults({ model, texts, context, overlay }) {
  const segmented = (name, labelKey, options) => field(texts, { key: `overlay:${name}`, labelKey, control: "segmented", value: overlay[name], options });
  return {
    key: "job-defaults",
    title: t(texts, "jobDefaults.title"),
    lead: t(texts, "jobDefaults.lead"),
    fields: [
      segmented("mode", "field.mode", CLEANING_MODES.map((mode) => ({ value: mode, label: modeLabel(texts, mode), icon: MODE_ICONS[mode] }))),
      ...SETTING_FIELDS.map((name) => segmented(name, `field.${name}`, SETTING_LADDERS[name].map((rung) => ({ value: rung, label: settingLabel(texts, name, rung) })))),
      field(texts, { key: "overlay:passes", labelKey: "field.passes", control: "stepper", value: overlay.passes, min: PASS_MIN, max: PASS_MAX }),
      field(texts, { key: "overlay:settingsPolicy", labelKey: "field.settingsPolicy", control: "segmented", value: overlay.settingsPolicy, options: SETTINGS_POLICIES.map((policy) => ({ value: policy, label: policyLabel(texts, policy) })), hintKey: `field.settingsPolicyHint.${overlay.settingsPolicy === "strict" ? "strict" : "bestEffort"}` }),
    ],
    invalid: overlay.submitted === true,
    save: decide(context, { operation: "configure_job_defaults", target: QUEUE_TARGET }),
    pending: list(model.pending).includes(QUEUE_TARGET),
  };
}
