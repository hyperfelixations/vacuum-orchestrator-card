// Rooms: releasing and locking them, their settings, targets and conditions, excluding, adding and
// ordering them. See internal dev doc §9 "Aktionsvertrag".

import { CREATE_TARGET, ROOMS_TARGET, roomTarget } from "../../../domain/affordances.js";
import { grantsOf, releaseFieldOf, releaseRows, withReleaseRoom, withoutReleaseRow } from "../../../domain/release-draft.js";
import { createRoomDraft, newBinding, roomDraftToPatch, roomFieldOf, updateRoomDraft } from "../../../domain/room-draft.js";
import { ROOM_SCOPES, findIn, pageFields } from "./shared.js";

export function roomActions({ ui, getModel, lifecycle, editing }) {
  const { run, submit, confirmOr } = lifecycle;
  const { clearError, editDraft } = editing;
  const findRoom = (roomId) => findIn(getModel(), "rooms", "roomId", roomId);

  // From the release dialog every listed room with its own kind in one command; from a room card
  // at once until the queue run ends, which asks nothing.
  function releaseRoom(roomId, overlay) {
    if (!overlay) return run("release_rooms", { grants: [{ room: roomId, kind: "queue_run" }] }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, success: { key: "notice.roomReleased" } });
    const rows = overlay.rooms || [];
    const one = rows.length === 1;
    return submit("release_rooms", { grants: grantsOf(rows) }, releaseFieldOf, { target: one ? roomTarget(rows[0].roomId) : "release_rooms", invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: one ? "notice.roomReleased" : "notice.roomsReleased" } });
  }

  return {
    "open-release": ({ roomId, roomIds, jobId = null }) => ui.openOverlay({ kind: "release", jobId, rooms: releaseRows(roomIds?.length ? roomIds : [roomId]) }),
    "add-release-room": ({ roomId }) => {
      if (ui.overlay?.kind === "release") ui.updateOverlay({ rooms: withReleaseRoom(ui.overlay.rooms, roomId) });
    },
    // Rows after the removed one move up, so the errors the integration named by row go.
    "remove-release-room": ({ index }) => {
      if (ui.overlay?.kind === "release") ui.updateOverlay({ rooms: withoutReleaseRow(ui.overlay.rooms, index), errors: null, formError: null });
    },
    "release-room": ({ roomId }) => releaseRoom(roomId, ui.overlay?.kind === "release" ? ui.overlay : null),
    // REL-04: every released room the view lists, locked with one command.
    "lock-rooms": ({ roomIds = [] }) => (roomIds.length ? run("revoke_rooms", { rooms: [...roomIds] }, { target: "revoke_rooms", invalidates: ROOM_SCOPES, success: { key: "notice.roomsLocked" } }) : null),
    "revoke-room": ({ roomId, close = false }) => run("revoke_rooms", { rooms: [roomId] }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: close, success: { key: "notice.roomLocked" } }),
    "edit-room": ({ roomId }) => {
      const room = findRoom(roomId);
      if (room) ui.openOverlay({ kind: "room-editor", draft: createRoomDraft(room) });
    },
    "save-room": async () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "room-editor") return null;
      const patch = roomDraftToPatch(overlay.draft);
      if (!Object.keys(patch).length) {
        ui.closeOverlay();
        return null;
      }
      const roomId = overlay.draft.meta.roomId;
      return submit("update_room", { room_id: roomId, configuration: patch }, roomFieldOf, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomSaved" } });
    },
    "add-binding": ({ robotId }) => {
      ui.updateOverlay({ draft: updateRoomDraft(ui.overlay.draft, "bindings", [...ui.overlay.draft.bindings, newBinding(robotId)]), bindingsOpen: true });
      clearError("bindings");
    },
    "remove-binding": ({ index }) => editDraft("bindings", ui.overlay.draft.bindings.filter((_item, position) => position !== index)),
    "disable-room": ({ roomId }) => confirmOr(
      { operation: "disable_room", parameters: { room_id: roomId }, options: { target: roomTarget(roomId), invalidates: ROOM_SCOPES, closeOverlay: ui.overlay?.kind === "room-editor", success: { key: "notice.roomDisabled" } } },
      { titleKey: "confirm.disableRoom.title", textKey: "confirm.disableRoom.text", confirmKey: "confirm.disableRoom.confirm", icon: "mdi:eye-off-outline", tone: "primary", vars: { room: findRoom(roomId)?.name ?? "" } }
    ),
    "enable-room": ({ roomId }) => run("enable_room", { room_id: roomId }, { target: roomTarget(roomId), invalidates: ROOM_SCOPES, success: { key: "notice.roomEnabled" } }),
    "create-room": () => ui.openOverlay({ kind: "room-create", name: "", areaId: null }),
    "save-new-room": () => {
      const overlay = ui.overlay;
      const name = String(overlay?.name ?? "").trim();
      const parameters = overlay?.areaId ? { name, area_id: overlay.areaId } : { name };
      return submit("create_room", parameters, pageFields({ name: "overlay:name", area_id: "overlay:areaId" }), { target: CREATE_TARGET, invalidates: ROOM_SCOPES, closeOverlay: true, success: { key: "notice.roomCreated" } });
    },
    "open-room-order": () => {
      const order = getModel()?.slots?.rooms?.data?.order;
      if (order) ui.openOverlay({ kind: "room-order", order, initial: order });
    },
    "save-room-order": () => {
      const overlay = ui.overlay;
      if (overlay?.kind !== "room-order") return null;
      if (overlay.order === overlay.initial) {
        ui.closeOverlay();
        return null;
      }
      return run("configure_room_order", { room_order: overlay.order }, { target: ROOMS_TARGET, invalidates: ["rooms"], closeOverlay: true, success: { key: "notice.roomOrderSaved" } });
    },
  };
}
