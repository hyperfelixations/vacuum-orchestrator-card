// Robots: adding one, its profile with option names, removing it, sending it home and resolving a
// recovery. See internal dev doc §9 "Aktionsvertrag".

import { CREATE_TARGET, robotTarget } from "../../../domain/affordances.js";
import { createRobotDraft, robotDraftToConfiguration, robotFieldOf } from "../../../domain/robot-draft.js";
import { ROBOT_SCOPES, findIn } from "./shared.js";

export function robotActions({ ui, getModel, lifecycle, editing }) {
  const { run, submit, confirmOr } = lifecycle;
  const { editDraft } = editing;
  return {
    "add-robot": () => ui.openOverlay({ kind: "robot-add" }),
    "add-candidate": ({ entityId }) => run("add_robot", { entity_id: entityId }, { target: CREATE_TARGET, invalidates: ROBOT_SCOPES, closeOverlay: ui.overlay?.kind === "robot-add", success: { key: "notice.robotAdded" } }),
    "edit-robot": ({ robotId }) => {
      const robot = findIn(getModel(), "robots", "robotId", robotId);
      const live = getModel()?.robotsLive?.[robotId]?.roles || {};
      const roleEntities = Object.fromEntries(Object.entries(live).filter(([, reading]) => reading?.entityId).map(([role, reading]) => [role, reading.entityId]));
      if (robot) ui.openOverlay({ kind: "robot-editor", draft: createRobotDraft(robot, { roleEntities }), open: [] });
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
      // The name is part of the profile; the setup names the robot as well.
      return submit("configure_robot", { robot_id: robotId, configuration: robotDraftToConfiguration(overlay.draft) }, robotFieldOf, { target: robotTarget(robotId), invalidates: [...ROBOT_SCOPES, "setup"], closeOverlay: true, success: { key: "notice.robotSaved" } });
    },
    "remove-robot": ({ robotId }) => confirmOr(
      { operation: "remove_robot", parameters: { robot_id: robotId }, options: { target: robotTarget(robotId), invalidates: ROBOT_SCOPES, closeOverlay: ui.overlay?.kind === "robot-editor", success: { key: "notice.robotRemoved" } } },
      { titleKey: "confirm.removeRobot.title", textKey: "confirm.removeRobot.text", confirmKey: "confirm.removeRobot.confirm", icon: "mdi:delete-outline", vars: { robot: findIn(getModel(), "robots", "robotId", robotId)?.name ?? "" } }
    ),
    "return-robot": ({ robotId }) => run("return_robot", { robot_id: robotId }, { target: robotTarget(robotId), invalidates: ["robots"], success: { key: "notice.robotReturning" } }),
    "open-recovery": ({ robotId }) => ui.openOverlay({ kind: "recovery", robotId, confirmStopped: false }),
    "resolve-recovery": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "recovery") return null;
      return run("resolve_recovery", { robot_id: overlay.robotId, confirm_stopped: overlay.confirmStopped === true }, { target: robotTarget(overlay.robotId), closeOverlay: true, success: { key: "notice.recoveryResolved" } });
    },
  };
}
