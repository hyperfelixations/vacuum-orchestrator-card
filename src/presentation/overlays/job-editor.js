// The job and template editor: rooms, mode, settings, then the optional texts and conditions.
// Choices are the integration's vocabularies; a room no robot reaches and an unreleased room
// are marked, not hidden — the integration decides at dispatch. See internal dev doc §8 "Editor".

import { CREATE_TARGET, decide, jobAffordances, jobTarget, templateAffordances, templateTarget } from "../../domain/affordances.js";
import { findJob } from "../common/lookups.js";
import { levelOptionsFor, validateDraft } from "../../domain/job-draft.js";
import { CLEANING_MODES, MOP_ROUTES, PASS_MAX, PASS_MIN, SEMANTIC_LEVELS, SETTINGS_POLICIES } from "../../domain/job-schema.js";
import { coveredRoomIds } from "../../application/setup-status.js";
import { list, robotsOf, roomsOf } from "../common/lookups.js";
import { levelLabel, modeLabel, policyLabel, routeLabel, t } from "../common/texts.js";
import { MODE_ICONS } from "../views/job-row.js";
import { entityField, errorText, field } from "./editor-fields.js";

const notSet = (texts) => ({ value: null, label: t(texts, "value.notSet") });

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

export function buildJobEditor({ model, texts, context, overlay }) {
  const draft = overlay.draft;
  const kind = draft.meta.kind;
  const validation = validateDraft(draft);
  const showErrors = overlay.submitted === true;
  const error = (key) => (showErrors ? errorText(texts, validation.errors[key]) : null);
  const queries = overlay.queries || {};
  const levels = (key) => [notSet(texts), ...levelOptionsFor(key, draft.mode, SEMANTIC_LEVELS).map((level) => ({ value: level, label: levelLabel(texts, level) }))];

  const template = kind === "template"
    ? [
        field(texts, { key: "templateName", labelKey: "field.templateName", control: "text", value: draft.templateName, error: error("templateName"), required: true }),
        field(texts, { key: "enabled", labelKey: "field.templateEnabled", control: "switch", value: draft.enabled, switchLabel: t(texts, "field.templateEnabledSwitch") }),
        field(texts, { key: "automatic", labelKey: "field.automatic", control: "switch", value: draft.automatic, switchLabel: t(texts, "field.automaticSwitch"), hintKey: "field.automaticHint" }),
      ]
    : [];

  const basics = [
    field(texts, { key: "roomIds", labelKey: "field.rooms", control: "chips", value: list(draft.roomIds), options: roomOptions(model, texts, list(draft.roomIds)), error: error("roomIds"), hintKey: roomsOf(model).length ? null : "editor.noRooms" }),
    field(texts, { key: "mode", labelKey: "field.mode", control: "segmented", value: draft.mode, options: CLEANING_MODES.map((mode) => ({ value: mode, label: modeLabel(texts, mode), icon: MODE_ICONS[mode] })), error: error("mode") }),
  ];

  const settings = [
    field(texts, { key: "passes", labelKey: "field.passes", control: "stepper", value: draft.passes, min: PASS_MIN, max: PASS_MAX, error: error("passes"), hintKey: "field.passesHint" }),
    field(texts, { key: "vacuumPower", labelKey: "field.vacuumPower", control: "segmented", value: draft.vacuumPower, options: levels("vacuumPower"), error: error("vacuumPower"), optional: true }),
    field(texts, { key: "mopIntensity", labelKey: "field.mopIntensity", control: "segmented", value: draft.mopIntensity, options: levels("mopIntensity"), error: error("mopIntensity"), optional: true }),
    field(texts, { key: "mopRoute", labelKey: "field.mopRoute", control: "segmented", value: draft.mopRoute, options: [notSet(texts), ...MOP_ROUTES.map((route) => ({ value: route, label: routeLabel(texts, route) }))], optional: true }),
    field(texts, { key: "settingsPolicy", labelKey: "field.settingsPolicy", control: "segmented", value: draft.settingsPolicy, options: SETTINGS_POLICIES.map((policy) => ({ value: policy, label: policyLabel(texts, policy) })), hintKey: `field.settingsPolicyHint.${draft.settingsPolicy === "strict" ? "strict" : "bestEffort"}` }),
  ];

  const more = [
    ...(kind === "job" ? [field(texts, { key: "name", labelKey: "field.jobName", control: "text", value: draft.name, optional: true, placeholder: t(texts, "field.jobNamePlaceholder") })] : []),
    entityField(texts, model, { key: "requiredOn", labelKey: "field.requiredOn", value: draft.requiredOn, query: queries.requiredOn, error: error("requiredOn"), hintKey: "field.requiredOnHint" }),
    entityField(texts, model, { key: "requiredOff", labelKey: "field.requiredOff", value: draft.requiredOff, query: queries.requiredOff, error: error("requiredOff"), hintKey: "field.requiredOffHint" }),
    field(texts, { key: "source", labelKey: "field.source", control: "text", value: draft.source, optional: true }),
    field(texts, { key: "reason", labelKey: "field.reason", control: "text", value: draft.reason, optional: true }),
    field(texts, { key: "note", labelKey: "field.note", control: "textarea", value: draft.note, optional: true }),
    field(texts, { key: "dedupeKey", labelKey: "field.dedupeKey", control: "text", value: draft.dedupeKey, optional: true, hintKey: "field.dedupeKeyHint" }),
  ];
  const moreOpen = overlay.moreOpen === true || more.some((entry) => entry.error) || ["source", "reason", "note", "dedupeKey"].some((key) => draft[key]) || list(draft.requiredOn).length > 0 || list(draft.requiredOff).length > 0;

  const target = kind === "template" ? (draft.meta.id ? templateTarget(draft.meta.id) : CREATE_TARGET) : draft.meta.id ? jobTarget(draft.meta.id) : CREATE_TARGET;
  const operation = kind === "template" ? "save_template" : draft.meta.id ? "update_job" : "create_job";
  const titleKey = kind === "template" ? (draft.meta.id ? "editor.editTemplate" : "editor.newTemplate") : draft.meta.id ? "editor.editJob" : "editor.newJob";
  return {
    key: "job-editor",
    title: t(texts, titleKey),
    groups: [
      ...(template.length ? [{ key: "template", title: t(texts, "editor.group.template"), fields: template }] : []),
      { key: "basics", title: t(texts, "editor.group.what"), fields: basics },
      { key: "settings", title: t(texts, "editor.group.settings"), fields: settings },
      { key: "more", title: t(texts, "editor.group.more"), fields: more, collapsible: true, open: moreOpen },
    ],
    dirty: validation.dirty,
    invalid: showErrors && !validation.valid,
    save: { label: t(texts, kind === "template" || draft.meta.id ? "action.save" : "action.addToQueue"), decision: decide(context, { operation, target }) },
    pending: list(model.pending).includes(target),
    remove: removeControl({ model, texts, context, draft }),
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
