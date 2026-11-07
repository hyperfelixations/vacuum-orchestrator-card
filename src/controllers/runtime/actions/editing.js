// Editing on a page: a field of the draft, the page's own state (`overlay:<key>`), the search text
// of an entity picker (`query:<field>`), and leaving an editor, which asks first while it holds
// unsaved changes. See internal dev doc §9 "Aktionsvertrag".

import { applyDraftChange, isDirty, toggleRoom } from "../../../domain/job-draft.js";
import { releaseField, releaseGroupOf, updateReleaseRow } from "../../../domain/release-draft.js";
import { intervalOf, isRoomDirty, newRequirement, splitList, updateRoomDraft } from "../../../domain/room-draft.js";
import { isRobotDirty, updateRobotDraft } from "../../../domain/robot-draft.js";
import { withoutFieldError } from "../../../domain/validation.js";
import { own } from "../../../core/lookup.js";

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

export function createEditing({ ui }) {
  // A changed field drops the error the integration gave for it; the next attempt to send
  // checks again.
  function clearError(field) {
    const errors = ui.overlay?.errors;
    if (!errors) return;
    // A field whose error belongs to a value it forms together with others clears that too.
    const next = [field, releaseGroupOf(field), intervalOf(field)].filter(Boolean).reduce(withoutFieldError, errors);
    if (next !== errors) ui.updateOverlay({ errors: Object.keys(next).length ? next : null });
  }

  function editDraft(field, value) {
    const overlay = ui.overlay;
    const reduce = own(DRAFT_REDUCERS, overlay?.kind);
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
    // The grace period's quick choice sets its minutes.
    if (field === "overlay:graceQuick") return setValue("overlay:minutes", value);
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

  return { clearError, editDraft, setValue };
}

export function editingActions({ ui, getConfig, editing, holds }) {
  const { clearError, editDraft, setValue } = editing;
  return {
    // Leaving an editor with unsaved changes asks first, like any other destructive step. Leaving
    // a deletion's dialog gives its hold back.
    back: () => {
      const top = ui.overlay;
      const dirty = own(DRAFT_DIRTY, top?.kind);
      if (top?.draft && dirty?.(top.draft) && getConfig()?.confirm_destructive !== false) {
        ui.openOverlay({ kind: "confirm", titleKey: "confirm.discard.title", textKey: "confirm.discard.text", confirmKey: "confirm.discard.confirm", icon: "mdi:close", command: { discard: true } });
        return;
      }
      ui.closeOverlay();
      if (top?.holdId && !top.sharedHold) holds.releaseHold(top.holdId);
    },
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
      // ROOM-08: a binding's segments, picked by name, stay its comma-separated targets.
      const binding = overlay?.kind === "room-editor" ? /^bindings\.(\d+)\.targetIds$/.exec(field) : null;
      if (binding) {
        const targets = splitList(overlay.draft.bindings[Number(binding[1])]?.targetIds ?? "");
        editDraft(field, (targets.includes(value) ? targets.filter((item) => item !== value) : [...targets, value]).join(", "));
        return;
      }
      const current = ui.overlay?.draft?.[field];
      const list = Array.isArray(current) ? current : [];
      editDraft(field, list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
      // A picked search result clears its search.
      if (ui.overlay?.queries?.[field]) ui.updateOverlay({ queries: { ...ui.overlay.queries, [field]: "" } });
    },
    "step-field": ({ field, step, min, max }) => {
      const onPage = typeof field === "string" && field.startsWith("overlay:");
      const current = Number(onPage ? ui.overlay?.[field.slice("overlay:".length)] : ui.overlay?.draft?.[field]);
      const base = Number.isFinite(current) ? current : min;
      setValue(field, Math.min(max, Math.max(min, base + step)));
    },
    "toggle-section": ({ key }) => {
      const open = ui.overlay?.open || [];
      ui.updateOverlay({ open: open.includes(key) ? open.filter((item) => item !== key) : [...open, key] });
    },
    "set-overlay": (patch) => ui.updateOverlay(patch),
    "remove-requirement": ({ index }) => editDraft("requirements", ui.overlay.draft.requirements.filter((_item, position) => position !== index)),
  };
}
