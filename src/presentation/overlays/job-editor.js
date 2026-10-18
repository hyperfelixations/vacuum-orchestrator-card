// The job and template editor in the order of use: rooms and mode, the settings the mode uses and
// the passes, then, folded away, a job's title and occasion, the note, the policy and conditions. Settings offer the rungs the integration's preview
// reports for the chosen rooms; a room no robot reaches and an unreleased room are marked, not
// hidden — the integration decides at dispatch. See internal dev doc §8 "Editor".

import { CREATE_TARGET, decide, jobAffordances, jobTarget, templateAffordances, templateTarget } from "../../domain/affordances.js";
import { ALL_ROOMS, settingsForMode } from "../../domain/job-draft.js";
import { CLEANING_MODES, PASS_MAX, PASS_MIN, SETTING_FIELDS, SETTING_LADDERS, SETTINGS_POLICIES, canonicalizeMode } from "../../domain/job-schema.js";
import { coveredRoomIds } from "../../domain/robots.js";
import { findJob, list, robotsOf, roomIndex, roomName, roomsOf, slotData } from "../common/lookups.js";
import { failureText, modeLabel, policyLabel, settingLabel, t } from "../common/texts.js";
import { MODE_ICONS } from "../views/job-row.js";
import { entityField, field, pageErrors } from "./editor-fields.js";

// All rooms first; while it is chosen the single rooms stay offered but muted. The hint says what
// the choice means; the warning what follows from it before the job waits: chosen rooms no robot
// reaches yet (for all rooms, those the integration's preview names) and chosen rooms not released.
function roomField(model, texts, draft, error, preview) {
  const allRooms = draft.allRooms === true;
  const options = [{ value: ALL_ROOMS, label: t(texts, "field.allRooms"), icon: "mdi:select-all" }, ...roomOptions(model, texts, list(draft.roomIds)).map((option) => (allRooms ? { ...option, included: true, title: t(texts, "editor.includedInAllRooms") } : option))];
  const base = allRooms ? (draft.meta.kind === "template" ? "editor.allRoomsTemplate" : "editor.allRoomsJob") : roomsOf(model).length ? null : "editor.noRooms";
  const index = roomIndex(model);
  const names = (ids) => ids.map((roomId) => roomName(roomId, index, model)).join(", ");
  const covered = coveredRoomIds(robotsOf(model));
  const chosen = allRooms ? [] : list(draft.roomIds);
  const unreachable = allRooms ? list(preview?.unreachableRoomIds) : chosen.filter((roomId) => !covered.has(roomId));
  const locked = chosen.filter((roomId) => index.byId.get(roomId)?.released === false);
  const warning = [
    unreachable.length ? t(texts, draft.meta.kind === "template" ? "editor.roomsUnreachableTemplate" : "editor.roomsUnreachable", { rooms: names(unreachable) }) : null,
    locked.length ? t(texts, "editor.roomsNotReleased", { rooms: names(locked) }) : null,
  ].filter(Boolean).join(" ");
  return field(texts, { key: "roomIds", labelKey: "field.rooms", control: "chips", value: allRooms ? [ALL_ROOMS] : chosen, options, error, hintKey: base, warning: warning || null });
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

// The name a job without a title carries: its rooms in the order chosen. Which rooms "All rooms"
// takes is the integration's decision when the job is created, so it names none.
function titlePreview(model, texts, draft) {
  const index = roomIndex(model);
  const names = draft.allRooms ? [] : list(draft.roomIds).map((roomId) => roomName(roomId, index, model));
  return names.length ? names.join(", ") : t(texts, "field.jobNamePlaceholder");
}

// Per setting the mode uses (as the integration's preview for this mode names them, the contract's
// list until it arrives): the rungs on offer and the wished one, which stays chosen when no robot
// offers it. A rung is marked only where marks tell rungs apart; the chosen rung's note is said in
// words. Without a preview every rung is offered.
export function settingChoices(draft, preview) {
  const current = preview && preview.mode === canonicalizeMode(draft.mode) ? preview : null;
  const named = current ? SETTING_FIELDS.filter((name) => current.settings?.[name]) : [];
  return (named.length ? named : settingsForMode(draft.mode)).map((name) => {
    const choice = current?.settings?.[name] ?? null;
    const offered = new Map(list(choice?.options).map((option) => [option.value, option]));
    const known = offered.size > 0;
    const value = draft[name];
    const noted = SETTING_LADDERS[name]
      .filter((rung) => !known || offered.has(rung) || rung === value)
      .map((rung) => ({ value: rung, note: !known ? null : !offered.has(rung) ? "notOffered" : offered.get(rung).supportedByAll ? null : "notEveryRobot" }));
    const alike = new Set(noted.map((option) => option.note)).size === 1;
    const chosen = noted.find((option) => option.value === value)?.note ?? null;
    return { name, value, options: alike ? noted.map((option) => ({ ...option, note: null })) : noted, chosenNote: chosen };
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
    warning: choice.chosenNote ? t(texts, `editor.${choice.chosenNote}`) : null,
    error,
  });
}

// `menu`: the key of the card's open menu, if any.
export function buildJobEditor({ model, texts, context, overlay, menu = null }) {
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

  // In the order of use: what is cleaned, how, then what is rarely set (see dev doc §8 "Editor").
  const basics = [
    roomField(model, texts, draft, error("roomIds"), preview),
    field(texts, { key: "mode", labelKey: "field.mode", control: "segmented", value: draft.mode, options: CLEANING_MODES.map((mode) => ({ value: mode, label: modeLabel(texts, mode), icon: MODE_ICONS[mode] })), error: error("mode") }),
  ];

  const settings = [
    ...settingChoices(draft, preview).map((choice) => settingField(texts, choice, error(choice.name))),
    field(texts, { key: "passes", labelKey: "field.passes", control: "stepper", value: draft.passes, min: PASS_MIN, max: PASS_MAX, error: error("passes"), hintKey: "field.passesHint" }),
  ];

  // JOB-23: a job's title and occasion are optional; the title's placeholder is the name it will
  // carry. A template has its own name and no occasion: the integration drops it when saving one.
  const more = [
    ...(kind === "job"
      ? [
          field(texts, { key: "name", labelKey: "field.jobName", control: "text", value: draft.name, optional: true, placeholder: titlePreview(model, texts, draft), error: error("name") }),
          field(texts, { key: "reason", labelKey: "field.reason", control: "text", value: draft.reason, optional: true, hintKey: "field.reasonHint", error: error("reason") }),
        ]
      : []),
    field(texts, { key: "note", labelKey: "field.note", control: "textarea", value: draft.note, optional: true, error: error("note") }),
    field(texts, { key: "settingsPolicy", labelKey: "field.settingsPolicy", control: "segmented", value: draft.settingsPolicy, options: SETTINGS_POLICIES.map((policy) => ({ value: policy, label: policyLabel(texts, policy) })), hintKey: `field.settingsPolicyHint.${draft.settingsPolicy === "strict" ? "strict" : "bestEffort"}`, error: error("settingsPolicy") }),
    entityField(texts, model, { key: "requiredOn", labelKey: "field.requiredOn", value: draft.requiredOn, query: queries.requiredOn, error: error("requiredOn"), hintKey: "field.requiredOnHint" }),
    entityField(texts, model, { key: "requiredOff", labelKey: "field.requiredOff", value: draft.requiredOff, query: queries.requiredOff, error: error("requiredOff"), hintKey: "field.requiredOffHint" }),
  ];
  const moreOpen = overlay.moreOpen === true || more.some((entry) => entry.error) || Boolean(draft.name) || Boolean(draft.reason) || Boolean(draft.note) || draft.settingsPolicy === "strict" || list(draft.requiredOn).length > 0 || list(draft.requiredOff).length > 0;

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
    remove: removeControl({ model, texts, context, draft, holdId: overlay.holdId ?? null }),
    hold: holdNotice(texts, overlay),
    menuOpen: menu === "editor",
    // JOB-24: what the editor shows, for a new job as for one being edited.
    saveAsTemplate: kind === "job" ? { action: "open-save-draft-template", label: t(texts, "action.saveAsTemplate"), decision: decide(context, { operation: "save_template", target: CREATE_TARGET }) } : null,
  };
}

// JOB-20, JOB-21: an editor that lost its hold keeps the draft: it says so and offers to hold the
// job again, or, once the job no longer waits or is gone, to add the draft as a new job.
const JOB_GONE = new Set(["job_not_waiting", "unknown_job"]);

function holdNotice(texts, overlay) {
  if (!overlay?.holdLost) return null;
  const failure = overlay.holdFailure;
  if (failure && JOB_GONE.has(failure.code)) return { text: `${failureText(texts, failure)} ${t(texts, "editor.holdGone")}`, action: "save-as-new-job", label: t(texts, "action.addAsNewJob") };
  return { text: failure ? failureText(texts, failure) : t(texts, "editor.holdLost"), action: "hold-again", label: t(texts, "action.protectAgain") };
}

// Editing an existing job or template also offers removing it.
// The integration refuses to delete a held job; an editor holding it deletes with its hold.
function removeControl({ model, texts, context, draft, holdId }) {
  const { kind, id } = draft.meta;
  if (!id) return null;
  if (kind === "template") {
    const template = (model.slots?.templates?.data?.items || []).find((entry) => entry.templateId === id);
    return template ? { action: "remove-template", args: { templateId: id }, label: t(texts, "action.deleteTemplate"), decision: templateAffordances(template, context).remove } : null;
  }
  const job = findJob(model, id);
  if (!job) return null;
  const verdict = jobAffordances(job, context).delete;
  const decision = holdId && verdict.reason === "job_held" ? decide(context, { operation: "delete_job", target: jobTarget(id) }) : verdict;
  return { action: "delete-job", args: { jobId: id }, label: t(texts, "action.deleteJob"), decision };
}
