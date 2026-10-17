// The job and template editor: title, rooms and mode, the settings the mode uses, then the
// optional policy, note and conditions. Settings offer the rungs the integration's preview
// reports for the chosen rooms; a room no robot reaches and an unreleased room are marked, not
// hidden — the integration decides at dispatch. See internal dev doc §8 "Editor".

import { CREATE_TARGET, decide, jobAffordances, jobTarget, templateAffordances, templateTarget } from "../../domain/affordances.js";
import { ALL_ROOMS, settingsForMode } from "../../domain/job-draft.js";
import { CLEANING_MODES, PASS_MAX, PASS_MIN, SETTING_LADDERS, SETTINGS_POLICIES } from "../../domain/job-schema.js";
import { coveredRoomIds } from "../../domain/robots.js";
import { findJob, list, robotsOf, roomsOf, slotData } from "../common/lookups.js";
import { modeLabel, policyLabel, settingLabel, t } from "../common/texts.js";
import { MODE_ICONS } from "../views/job-row.js";
import { entityField, field, pageErrors } from "./editor-fields.js";

// All rooms first; while it is chosen the single rooms stay offered but muted.
function roomField(model, texts, draft, error) {
  const allRooms = draft.allRooms === true;
  const options = [{ value: ALL_ROOMS, label: t(texts, "field.allRooms"), icon: "mdi:select-all" }, ...roomOptions(model, texts, list(draft.roomIds)).map((option) => (allRooms ? { ...option, muted: true } : option))];
  const hintKey = allRooms ? (draft.meta.kind === "template" ? "editor.allRoomsTemplate" : "editor.allRoomsJob") : roomsOf(model).length ? null : "editor.noRooms";
  return field(texts, { key: "roomIds", labelKey: "field.rooms", control: "chips", value: allRooms ? [ALL_ROOMS] : list(draft.roomIds), options, error, hintKey });
}

function roomOptions(model, texts, selected) {
  const covered = coveredRoomIds(robotsOf(model));
  const rooms = roomsOf(model).filter((room) => (room.enabled && !room.areaMissing) || selected.includes(room.roomId));
  return rooms
    .slice()
    .sort((one, other) => one.name.localeCompare(other.name))
    .map((room) => {
      const reachable = covered.has(room.roomId);
      return {
        value: room.roomId,
        label: room.name,
        badge: !reachable ? "mdi:robot-vacuum-alert" : !room.released ? "mdi:lock-outline" : null,
        title: !reachable ? t(texts, "editor.roomUnreachable") : !room.released ? t(texts, "editor.roomNotReleased") : null,
      };
    });
}

// Per setting the mode uses: the rungs on offer and the wished one, which stays chosen and marked
// when no robot offers it. Without a preview every rung is offered.
export function settingChoices(draft, preview) {
  return settingsForMode(draft.mode).map((name) => {
    const choice = preview?.settings?.[name] ?? null;
    const offered = new Map(list(choice?.options).map((option) => [option.value, option]));
    const known = offered.size > 0;
    const value = draft[name];
    const options = SETTING_LADDERS[name]
      .filter((rung) => !known || offered.has(rung) || rung === value)
      .map((rung) => ({ value: rung, note: !known ? null : !offered.has(rung) ? "notOffered" : offered.get(rung).supportedByAll ? null : "notEveryRobot" }));
    return { name, value, options };
  });
}

function settingField(texts, choice, error) {
  return field(texts, {
    key: choice.name,
    labelKey: `field.${choice.name}`,
    control: "segmented",
    value: choice.value,
    options: choice.options.map((option) => ({
      value: option.value,
      label: settingLabel(texts, choice.name, option.value),
      badge: option.note ? "mdi:information-outline" : null,
      title: option.note ? t(texts, `editor.${option.note}`) : null,
    })),
    error,
  });
}

export function buildJobEditor({ model, texts, context, overlay }) {
  const draft = overlay.draft;
  const kind = draft.meta.kind;
  const { error, invalid } = pageErrors(texts, overlay);
  const queries = overlay.queries || {};
  const preview = slotData(model, "preview");

  // A template names itself first; how it is used follows what it cleans, so the rooms and the
  // mode show without scrolling.
  const template = kind === "template" ? [field(texts, { key: "templateName", labelKey: "field.templateName", control: "text", value: draft.templateName, error: error("templateName"), required: true })] : [];
  const use = kind === "template"
    ? [
        field(texts, { key: "enabled", labelKey: "field.templateEnabled", control: "switch", value: draft.enabled, switchLabel: t(texts, "field.templateEnabledSwitch"), error: error("enabled") }),
        field(texts, { key: "automatic", labelKey: "field.automatic", control: "switch", value: draft.automatic, switchLabel: t(texts, "field.automaticSwitch"), hintKey: "field.automaticHint", error: error("automatic") }),
      ]
    : [];

  const basics = [
    ...(kind === "job" ? [field(texts, { key: "name", labelKey: "field.jobName", control: "text", value: draft.name, optional: true, placeholder: t(texts, "field.jobNamePlaceholder"), error: error("name") })] : []),
    roomField(model, texts, draft, error("roomIds")),
    field(texts, { key: "mode", labelKey: "field.mode", control: "segmented", value: draft.mode, options: CLEANING_MODES.map((mode) => ({ value: mode, label: modeLabel(texts, mode), icon: MODE_ICONS[mode] })), error: error("mode") }),
  ];

  const settings = [
    ...settingChoices(draft, preview).map((choice) => settingField(texts, choice, error(choice.name))),
    field(texts, { key: "passes", labelKey: "field.passes", control: "stepper", value: draft.passes, min: PASS_MIN, max: PASS_MAX, error: error("passes"), hintKey: "field.passesHint" }),
  ];

  const more = [
    field(texts, { key: "settingsPolicy", labelKey: "field.settingsPolicy", control: "segmented", value: draft.settingsPolicy, options: SETTINGS_POLICIES.map((policy) => ({ value: policy, label: policyLabel(texts, policy) })), hintKey: `field.settingsPolicyHint.${draft.settingsPolicy === "strict" ? "strict" : "bestEffort"}`, error: error("settingsPolicy") }),
    field(texts, { key: "note", labelKey: "field.note", control: "textarea", value: draft.note, optional: true, error: error("note") }),
    entityField(texts, model, { key: "requiredOn", labelKey: "field.requiredOn", value: draft.requiredOn, query: queries.requiredOn, error: error("requiredOn"), hintKey: "field.requiredOnHint" }),
    entityField(texts, model, { key: "requiredOff", labelKey: "field.requiredOff", value: draft.requiredOff, query: queries.requiredOff, error: error("requiredOff"), hintKey: "field.requiredOffHint" }),
  ];
  const moreOpen = overlay.moreOpen === true || more.some((entry) => entry.error) || Boolean(draft.note) || draft.settingsPolicy === "strict" || list(draft.requiredOn).length > 0 || list(draft.requiredOff).length > 0;

  const target = kind === "template" ? (draft.meta.id ? templateTarget(draft.meta.id) : CREATE_TARGET) : draft.meta.id ? jobTarget(draft.meta.id) : CREATE_TARGET;
  const operation = kind === "template" ? "save_template" : draft.meta.id ? "update_job" : "create_job";
  const titleKey = kind === "template" ? (draft.meta.id ? "editor.editTemplate" : "editor.newTemplate") : draft.meta.id ? "editor.editJob" : "editor.newJob";
  // Starting at once is offered only for a new job the integration says could start now.
  const newJob = kind === "job" && !draft.meta.id;
  return {
    key: "job-editor",
    title: t(texts, titleKey),
    groups: [
      ...(template.length ? [{ key: "template", title: t(texts, "editor.group.template"), fields: template }] : []),
      { key: "basics", title: t(texts, "editor.group.what"), fields: basics },
      { key: "settings", title: t(texts, "editor.group.settings"), fields: settings },
      ...(use.length ? [{ key: "use", title: t(texts, "editor.group.use"), fields: use }] : []),
      { key: "more", title: t(texts, "editor.group.more"), fields: more, collapsible: true, open: moreOpen },
    ],
    invalid,
    save: { label: t(texts, kind === "template" || draft.meta.id ? "action.save" : "action.addToQueue"), decision: decide(context, { operation, target }) },
    startNow: newJob && preview?.startableNow === true ? { label: t(texts, "action.startNow"), decision: decide(context, { operation: "create_job", target }) } : null,
    pending: list(model.pending).includes(target),
    remove: removeControl({ model, texts, context, draft }),
    saveAsTemplate: kind === "job" && draft.meta.id ? { action: "open-save-template", args: { jobId: draft.meta.id }, label: t(texts, "action.saveAsTemplate"), decision: decide(context, { operation: "save_job_as_template", target }) } : null,
  };
}

// Editing an existing job or template also offers removing it.
function removeControl({ model, texts, context, draft }) {
  const { kind, id } = draft.meta;
  if (!id) return null;
  if (kind === "template") {
    const template = (model.slots?.templates?.data?.items || []).find((entry) => entry.templateId === id);
    return template ? { action: "remove-template", args: { templateId: id }, label: t(texts, "action.deleteTemplate"), decision: templateAffordances(template, context).remove } : null;
  }
  const job = findJob(model, id);
  return job ? { action: "delete-job", args: { jobId: id }, label: t(texts, "action.deleteJob"), decision: jobAffordances(job, context).delete } : null;
}
