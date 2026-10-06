// Robot dialogs: adding a discovered robot and editing a profile. A role is automatic
// (discovery decides), off, or a chosen entity; option mappings translate the integration's
// semantic values into the robot's own option names. See internal dev doc §8 "Roboter".

import { candidateAffordance, decide, robotAffordances, robotTarget } from "../../domain/affordances.js";
import { OPERATIONS, ROBOT_OPTION_MAPS, ROBOT_ROLES, ROBOT_ROLE_DOMAINS, ROBOT_TIMEOUT_FIELDS } from "../../domain/job-schema.js";
import { validateRobotDraft } from "../../domain/robot-draft.js";
import { isConfiguredCandidate } from "../../domain/robots.js";
import { entityName, list, robotsOf, slotData } from "../common/lookups.js";
import { adapterLabel, operationLabel, settingLabel, t } from "../common/texts.js";
import { entityField, errorText, field } from "./editor-fields.js";

export function buildRobotAdd({ model, texts, context }) {
  const robots = robotsOf(model);
  const status = model.slots?.candidates?.status;
  const decision = candidateAffordance(context);
  return {
    key: "robot-add",
    title: t(texts, "robotAdd.title"),
    loading: !slotData(model, "candidates") && (status === "loading" || status === "idle"),
    error: !slotData(model, "candidates") ? model.slots?.candidates?.error ?? null : null,
    candidates: list(slotData(model, "candidates")?.items).map((candidate) => {
      const configured = isConfiguredCandidate(candidate, robots);
      return {
        key: candidate.registryId,
        entityId: candidate.entityId,
        name: candidate.name,
        adapter: adapterLabel(texts, candidate.adapter),
        protocol: candidate.protocol ? t(texts, "robot.protocol.roborockV1") : null,
        roles: Object.keys(candidate.roles).map((role) => t(texts, `role.${role}`)),
        ambiguous: candidate.ambiguousRoles.map((role) => t(texts, `role.${role}`)),
        configured,
        decision: configured ? { state: "hidden", reason: null } : decision,
      };
    }),
  };
}

// What "automatic" means for a role is what discovery found for this vacuum.
function roleHint(texts, model, entry, live, role) {
  if (entry.mode === "off") return t(texts, "robotEditor.roleOff");
  if (entry.mode === "entity") return null;
  const found = live?.discovered?.[role];
  if (found) return t(texts, "robotEditor.roleDiscovered", { entity: entityName(found, model) });
  return live?.ambiguousRoles?.includes(role) ? t(texts, "robotEditor.roleAmbiguous") : t(texts, "robotEditor.roleNotFound");
}

function roleRow(texts, model, draft, overlay, role, errors, live) {
  const entry = draft.roles[role];
  const domain = ROBOT_ROLE_DOMAINS[role];
  const key = `roles.${role}.entity`;
  return {
    key: role,
    mode: field(texts, {
      key: `roles.${role}.mode`,
      labelKey: `role.${role}`,
      control: "segmented",
      layout: "inline",
      value: entry.mode,
      options: ["auto", "off", "entity"].map((value) => ({ value, label: t(texts, `robotEditor.roleMode.${value}`) })),
      hint: roleHint(texts, model, entry, live, role),
      attention: entry.mode === "auto" && Boolean(live?.ambiguousRoles?.includes(role)),
    }),
    entity: entry.mode === "entity"
      ? { ...entityField(texts, model, { key, labelKey: "robotEditor.roleEntityOf", labelVars: { role: t(texts, `role.${role}`) }, value: entry.entity ? [entry.entity] : [], query: overlay.queries?.[key], domains: [domain], error: errorText(texts, errors[`roles.${role}`]), optional: false }), labelHidden: true, single: true }
      : null,
  };
}

function optionGroups(texts, draft) {
  const labels = { mode_options: (key) => operationLabel(texts, key), vacuum_levels: (key) => settingLabel(texts, "vacuumPower", key), water_levels: (key) => settingLabel(texts, "mopIntensity", key), mop_routes: (key) => settingLabel(texts, "mopRoute", key) };
  return Object.entries(ROBOT_OPTION_MAPS).map(([name, keys]) => {
    const entries = draft.optionMaps[name] || {};
    const shown = keys || Object.keys(entries);
    return {
      key: name,
      title: t(texts, `robotEditor.optionMap.${name}`),
      free: keys === null,
      fields: shown.map((key) => ({ ...field(texts, { key: `optionMaps.${name}.${key}`, labelKey: "robotEditor.optionValue", control: "text", value: entries[key] ?? "" }), label: labels[name] ? labels[name](key) : key, removable: keys === null })),
    };
  });
}

export function buildRobotEditor({ model, texts, context, overlay }) {
  const draft = overlay.draft;
  const robot = robotsOf(model).find((entry) => entry.robotId === draft.meta.robotId) || null;
  const validation = validateRobotDraft(draft);
  const errors = overlay.submitted ? validation.errors : {};
  const error = (key) => errorText(texts, errors[key]);
  const open = (key) => list(overlay.open).includes(key) || Object.keys(errors).some((name) => name.startsWith(key));
  const actions = robot ? robotAffordances(robot, context) : null;
  const general = [
    field(texts, { key: "enabled", labelKey: "robotEditor.enabled", control: "switch", value: draft.enabled, switchLabel: t(texts, "robotEditor.enabledSwitch") }),
    field(texts, { key: "allowedOperations", labelKey: "robotEditor.allowedOperations", control: "chips", value: draft.allowedOperations, options: OPERATIONS.map((value) => ({ value, label: operationLabel(texts, value) })), error: error("allowedOperations") }),
    field(texts, { key: "fixedMode", labelKey: "robotEditor.fixedMode", control: "segmented", value: draft.fixedMode, options: [{ value: null, label: t(texts, "robotEditor.notFixed") }, ...OPERATIONS.map((value) => ({ value, label: operationLabel(texts, value) }))], hintKey: "robotEditor.fixedModeHint" }),
    field(texts, { key: "preference", labelKey: "robotEditor.preference", control: "text", inputType: "number", min: -100, max: 100, step: 1, value: draft.preference, error: error("preference"), hintKey: "robotEditor.preferenceHint" }),
    field(texts, { key: "minimumBattery", labelKey: "robotEditor.minimumBattery", control: "text", inputType: "number", min: 0, max: 100, step: 1, value: draft.minimumBattery ?? "", error: error("minimumBattery"), optional: true, hintKey: "robotEditor.minimumBatteryHint" }),
  ];
  const areas = field(texts, { key: "targetAreas", labelKey: "robotEditor.targetAreas", control: "chips", value: draft.targetAreas, options: list(model.areas).map((area) => ({ value: area.areaId, label: area.name })), hintKey: "robotEditor.targetAreasHint" });
  const requirements = draft.requirements.map((item, index) => ({
    key: `${index}:${item.entityId}`,
    index,
    name: entityName(item.entityId, model),
    accepted: field(texts, { key: `requirements.${index}.acceptedStates`, labelKey: "room.acceptedStates", control: "text", value: item.acceptedStates }),
    operation: field(texts, { key: `requirements.${index}.operation`, labelKey: "robotEditor.requirementOperation", control: "segmented", value: item.operation, options: [{ value: null, label: t(texts, "robotEditor.allOperations") }, ...OPERATIONS.map((value) => ({ value, label: operationLabel(texts, value) }))] }),
    error: errorText(texts, errors[`requirements.${index}`]),
  }));
  return {
    key: "robot-editor",
    robotId: draft.meta.robotId,
    title: t(texts, "robotEditor.title", { robot: robot?.name || draft.meta.robotId }),
    lead: robot ? t(texts, "robotEditor.lead", { entity: robot.configuration.entityId || "", adapter: adapterLabel(texts, draft.meta.adapter) }) : null,
    general,
    areas,
    sections: {
      roles: { open: open("roles"), rows: ROBOT_ROLES.map((role) => roleRow(texts, model, draft, overlay, role, errors, model.robotsLive?.[draft.meta.robotId])) },
      requirements: { open: open("requirements") || draft.requirements.length > 0, rows: requirements, search: entityField(texts, model, { key: "requirementsAdd", labelKey: "room.addCondition", value: [], query: overlay.queries?.requirementsAdd, hintKey: "robotEditor.requirementsHint" }) },
      options: { open: open("optionMaps"), groups: optionGroups(texts, draft), error: Object.entries(errors).filter(([key]) => key.startsWith("optionMaps")).map(([, code]) => errorText(texts, code))[0] ?? null, newKey: overlay.newOptionKey ?? "", newValue: overlay.newOptionValue ?? "" },
      timeouts: { open: open("timeouts"), fields: Object.keys(ROBOT_TIMEOUT_FIELDS).map((name) => field(texts, { key: `timeouts.${name}`, labelKey: `robotEditor.timeout.${name}`, control: "text", inputType: "number", min: 1, max: 86400, step: 1, value: draft.timeouts[name], error: error(`timeouts.${name}`) })) },
      identity: {
        open: open("identity"),
        fields: [
          ...(draft.meta.adapter === "roborock" ? [field(texts, { key: "protocol", labelKey: "robotEditor.protocol", control: "segmented", value: draft.protocol, options: [{ value: null, label: t(texts, "robotEditor.protocolGeneric") }, { value: "roborock_v1", label: t(texts, "robot.protocol.roborockV1") }], hintKey: "robotEditor.protocolHint" })] : []),
          field(texts, { key: "physicalRobotId", labelKey: "robotEditor.physicalRobotId", control: "text", value: draft.physicalRobotId ?? "", optional: true, hintKey: "robotEditor.physicalRobotIdHint" }),
        ],
      },
    },
    invalid: Boolean(overlay.submitted) && !validation.valid,
    save: actions?.configure ?? decide(context, { operation: "configure_robot", target: robotTarget(draft.meta.robotId) }),
    remove: actions?.remove ?? null,
  };
}
