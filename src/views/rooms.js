// The rooms view. See internal dev doc §8 "Räume".

import { boolOption, enumOption } from "../config/option-schemas.js";
import { buildRoomsView } from "../presentation/views/rooms.js";
import { button, e, icon, pill } from "../render/primitives/markup.js";
import { emptyState, errorState, loadingState } from "./parts.js";
import { ROOMS_CSS } from "./styles/rooms.js";

function dueRow(line) {
  const bar = line.share === null ? "" : `<span class="voc-due-bar" aria-hidden="true"><span style="width:${Math.round(line.share * 100)}%"></span></span>`;
  const quality = line.quality ? `<span class="voc-due-quality" data-quality="${e(line.qualityKey)}">${e(line.quality)}</span>` : "";
  return `<div class="voc-due" data-key="due:${e(line.key)}" data-due="${e(line.state)}"><span class="voc-due-label">${icon(line.icon)}${e(line.label)}</span><span class="voc-due-status">${e(line.status)}</span>${bar}<span class="voc-due-last">${e(line.last)}${quality ? " · " : ""}${quality}${line.reason ? ` · ${e(line.reason)}` : ""}</span></div>`;
}

// The release control keeps the trailing place and switches with the room's state: a locked room
// offers release, a released one offers lock.
function releaseToggle(context, room) {
  const released = room.actions.revoke.state !== "hidden";
  return released
    ? button({ action: "revoke-room", args: { roomId: room.roomId }, label: context.t("rooms.lock"), iconName: "mdi:lock-outline", className: "voc-room-toggle", decision: room.actions.revoke, reasonText: context.reason(room.actions.revoke) })
    : button({ action: "open-release", args: { roomId: room.roomId }, label: context.t("rooms.openRelease"), iconName: "mdi:lock-open-variant-outline", className: "voc-room-toggle", decision: room.actions.release, reasonText: context.reason(room.actions.release) });
}

function roomCard(context, room) {
  const actions = [
    button({ action: "create-job", args: { roomIds: [room.roomId] }, label: context.t("rooms.addJob"), iconName: "mdi:plus", variant: "quiet", decision: room.actions.createJob, reasonText: context.reason(room.actions.createJob) }),
    button({ action: "enable-room", args: { roomId: room.roomId }, label: context.t("rooms.enable"), iconName: "mdi:eye-outline", variant: "quiet", decision: room.actions.enable, reasonText: context.reason(room.actions.enable) }),
    releaseToggle(context, room),
  ].join("");
  const robots = room.unreachable
    ? `<span class="voc-room-meta-item voc-room-warning">${icon("mdi:robot-vacuum-alert")}${e(context.t("rooms.unreachable"))}</span>`
    : room.robots.length
      ? `<span class="voc-room-meta-item">${icon("mdi:robot-vacuum")}${e(room.robots.join(", "))}</span>`
      : "";
  const conditions = room.conditions.map((entry) => `<span class="voc-room-meta-item" data-key="condition:${e(entry.key)}">${icon("mdi:door")}${e(context.t("rooms.condition", { entity: entry.name, state: entry.state, allowed: entry.allowed }))}</span>`).join("");
  const settings = button({ action: "edit-room", args: { roomId: room.roomId }, label: context.t("rooms.settings", { room: room.name }), iconName: "mdi:cog-outline", variant: "icon", decision: room.actions.edit, reasonText: context.reason(room.actions.edit) });
  return `<article class="voc-room" data-key="room:${e(room.roomId)}"${room.enabled ? "" : ' data-excluded="true"'}><header class="voc-room-head"><span class="voc-room-icon" aria-hidden="true">${icon(room.icon)}</span><h3 class="voc-room-name">${e(room.name)}</h3>${settings}</header><div class="voc-room-status">${pill(room.release.label, room.release.tone, { iconName: room.release.icon })}</div><div class="voc-room-due">${room.due.map(dueRow).join("")}</div>${robots || conditions ? `<div class="voc-room-meta">${robots}${conditions}</div>` : ""}<div class="voc-room-actions">${actions}</div></article>`;
}

export function renderRooms(context, vm) {
  if (vm.error) return `<div class="voc-view voc-rooms" data-key="view:rooms">${errorState(context, vm.error)}</div>`;
  if (vm.loading) return `<div class="voc-view voc-rooms" data-key="view:rooms">${loadingState(context)}</div>`;
  const cards = vm.rooms.length ? `<div class="voc-room-grid">${vm.rooms.map((room) => roomCard(context, room)).join("")}</div>` : emptyState("mdi:floor-plan", context.t("rooms.empty"));
  const excluded = vm.excludedCount
    ? `<div class="voc-view-footer" data-key="excluded">${button({ action: "toggle", args: { key: "rooms:excluded" }, label: context.t(vm.showExcluded ? "rooms.hideExcluded" : "rooms.showExcluded", { count: vm.excludedCount }), iconName: vm.showExcluded ? "mdi:eye-off-outline" : "mdi:eye-outline", variant: "quiet" })}</div>`
    : "";
  return `<div class="voc-view voc-rooms" data-key="view:rooms">${cards}${excluded}</div>`;
}

export const roomsView = Object.freeze({
  key: "rooms",
  icon: "mdi:floor-plan",
  requires: ["get_rooms"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({ sort: enumOption("configured", ["configured", "name", "due"]), show_disabled: boolOption(false) }),
  primary: Object.freeze({ action: "create-room", icon: "mdi:plus", labelKey: "action.createRoom", operation: "create_room", target: "create" }),
  scopes: () => [],
  build: ({ model, texts, context, options, config, ui }) => buildRoomsView({ model, texts, context, options, ui, timeFormat: config.time_format }),
  render: renderRooms,
  css: ROOMS_CSS,
});
