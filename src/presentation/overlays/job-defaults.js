// Two small pages around job intents: saving a job as a template, and the integration's
// defaults for new jobs. Each edits its values on the page itself and sends one command.
// See internal dev doc §8 "Vorgaben" and "Auftragsdetail".

import { CREATE_TARGET, QUEUE_TARGET, decide, jobTarget } from "../../domain/affordances.js";
import { CLEANING_MODES, PASS_MAX, PASS_MIN, SETTING_LADDERS, SETTINGS_POLICIES } from "../../domain/job-schema.js";
import { findJob, list, roomIndex, jobTitle } from "../common/lookups.js";
import { modeLabel, policyLabel, settingLabel, t } from "../common/texts.js";
import { MODE_ICONS } from "../views/job-row.js";
import { field, pageErrors } from "./editor-fields.js";

// From the detail page a stored job; from the editor its draft as shown (`editorId`).
export function buildSaveTemplate({ model, texts, context, overlay }) {
  const drafted = Boolean(overlay.editorId);
  const job = drafted ? null : findJob(model, overlay.jobId);
  const target = drafted ? CREATE_TARGET : jobTarget(overlay.jobId);
  const { error, invalid } = pageErrors(texts, overlay);
  return {
    key: "save-template",
    title: t(texts, "saveTemplate.title"),
    lead: t(texts, drafted ? "saveTemplate.leadDraft" : "saveTemplate.lead"),
    job: job ? jobTitle(job, roomIndex(model), model) : null,
    fields: [
      field(texts, { key: "overlay:name", labelKey: "saveTemplate.name", control: "text", value: String(overlay.name ?? ""), required: true, error: error("overlay:name") }),
      field(texts, { key: "overlay:automatic", labelKey: "saveTemplate.automatic", control: "switch", value: overlay.automatic === true, switchLabel: t(texts, "saveTemplate.automaticSwitch"), hintKey: "field.automaticHint", error: error("overlay:automatic") }),
    ],
    invalid,
    save: decide(context, { operation: drafted ? "save_template" : "save_job_as_template", target }),
    pending: list(model.pending).includes(target),
  };
}

// Every setting is shown whatever the mode: a default serves any mode that uses it. The boxes
// follow the editor: what every job takes, what vacuuming and mopping take, then the rarely set
// rule, folded like in the editor while it is the usual one.
export function buildJobDefaults({ model, texts, context, overlay }) {
  const { error, invalid } = pageErrors(texts, overlay);
  const segmented = (name, labelKey, options) => field(texts, { key: `overlay:${name}`, labelKey, control: "segmented", value: overlay[name], options, error: error(`overlay:${name}`) });
  const ladder = (name) => segmented(name, `field.${name}`, SETTING_LADDERS[name].map((rung) => ({ value: rung, label: settingLabel(texts, name, rung) })));
  const policy = field(texts, { key: "overlay:settingsPolicy", labelKey: "field.settingsPolicy", control: "segmented", value: overlay.settingsPolicy, options: SETTINGS_POLICIES.map((value) => ({ value, label: policyLabel(texts, value) })), hintKey: `field.settingsPolicyHint.${overlay.settingsPolicy === "strict" ? "strict" : "bestEffort"}`, error: error("overlay:settingsPolicy") });
  return {
    key: "job-defaults",
    title: t(texts, "jobDefaults.title"),
    lead: t(texts, "jobDefaults.lead"),
    groups: [
      {
        key: "job",
        title: t(texts, "jobDefaults.group.job"),
        fields: [
          segmented("mode", "field.mode", CLEANING_MODES.map((mode) => ({ value: mode, label: modeLabel(texts, mode), icon: MODE_ICONS[mode] }))),
          field(texts, { key: "overlay:passes", labelKey: "field.passes", control: "stepper", value: overlay.passes, min: PASS_MIN, max: PASS_MAX, hintKey: "field.passesHint", error: error("overlay:passes") }),
        ],
      },
      { key: "vacuum", title: t(texts, "jobDefaults.group.vacuum"), fields: [ladder("vacuumPower")] },
      { key: "mop", title: t(texts, "jobDefaults.group.mop"), fields: [ladder("mopIntensity"), ladder("mopRoute")] },
      { key: "more", title: t(texts, "editor.group.more"), fields: [policy], collapsible: true, open: overlay.moreOpen === true || overlay.settingsPolicy === "strict" || Boolean(policy.error) },
    ],
    invalid,
    save: decide(context, { operation: "configure_job_defaults", target: QUEUE_TARGET }),
    pending: list(model.pending).includes(QUEUE_TARGET),
  };
}
