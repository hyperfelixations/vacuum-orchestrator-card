// The rooms view. See internal dev doc §8 "Räume".

import { boolOption } from "../config/option-schemas.js";
import { buildRoomsView } from "../presentation/views/rooms.js";
import { button, e, icon, pill } from "../render/primitives/markup.js";
import { emptyState, errorState, itemMenu, loadingState } from "./parts.js";
import { ROOMS_CSS } from "./styles/rooms.js";

// The verdict beside the operation: what the interval counts as an icon, and a partly observed
// count with a mark that explains itself when tapped (DUE-03, UI-22).
function dueRow(line) {
  if (line.none) return `<div class="voc-due voc-due--none" data-key="due:none" data-due="disabled">${icon(line.icon)}<span>${e(line.status)}</span></div>`;
  const bar = line.share === null ? "" : `<span class="voc-due-bar" aria-hidden="true"><span style="width:${Math.round(line.share * 100)}%"></span></span>`;
  const basis = line.basis ? `<span class="voc-due-basis" role="img" aria-label="${e(line.basis.label)}" title="${e(line.basis.label)}">${icon(line.basis.icon)}</span>` : "";
  const text = `${basis}<span>${e(line.status)}</span>`;
  const status = line.partial
    ? `<button type="button" class="voc-due-status" data-explain="${e(line.partial)}" title="${e(line.partial)}">${text}<span class="voc-due-mark" aria-hidden="true">*</span><span class="voc-sr-only">${e(line.partial)}</span></button>`
    : `<span class="voc-due-status">${text}</span>`;
  return `<div class="voc-due" data-key="due:${e(line.key)}" data-due="${e(line.state)}"${line.overdue ? ' data-overdue="true"' : ""}><span class="voc-due-label">${icon(line.icon)}${e(line.label)}</span>${status}${bar}${line.last ? `<span class="voc-due-last">${e(line.last)}</span>` : ""}</div>`;
}

// The release control keeps the trailing place and switches with the room's state: a locked room
// offers release, a released one offers lock.
function releaseToggle(context, room) {
  const released = room.actions.revoke.state !== "hidden";
  return released
    ? button({ action: "revoke-room", args: { roomId: room.roomId }, label: context.t("rooms.lock"), iconName: "mdi:lock-outline", className: "voc-room-toggle", decision: room.actions.revoke, reasonText: context.reason(room.actions.revoke) })
    : button({ action: "open-release", args: { roomId: room.roomId }, label: context.t("rooms.openRelease"), iconName: "mdi:lock-open-variant-outline", className: "voc-room-toggle", decision: room.actions.release, reasonText: context.reason(room.actions.release) });
}

const WORK_ICONS = Object.freeze({ cleaning: "mdi:robot-vacuum", here: "mdi:map-marker-radius-outline", waiting: "mdi:timer-sand" });

// UI-32: one main action, release or lock (taking an excluded room back in), then the menu.
function roomCard(context, room) {
  const actions = [
    room.enabled ? releaseToggle(context, room) : button({ action: "enable-room", args: { roomId: room.roomId }, label: context.t("rooms.enable"), iconName: "mdi:eye-outline", className: "voc-room-toggle", decision: room.actions.enable, reasonText: context.reason(room.actions.enable) }),
    itemMenu(context, { key: `room:${room.roomId}`, label: context.t("action.moreFor", { job: room.name }), items: room.menu, open: room.menuOpen === true }),
  ].join("");
  const reasons = room.reach ? room.reach.reasons.map((reason) => `<span class="voc-room-meta-item voc-room-reason">${e(reason)}</span>`).join("") : "";
  const remedies = room.reach
    ? [
        room.reach.assign ? button({ action: "open-more-info", args: { entityId: room.reach.assign.entityId }, label: context.t("rooms.assign"), iconName: "mdi:map-marker-plus-outline", variant: "text", className: "voc-room-remedy" }) : "",
        button({ action: "disable-room", args: { roomId: room.roomId }, label: context.t("action.exclude"), iconName: "mdi:eye-off-outline", variant: "text", className: "voc-room-remedy", decision: room.actions.disable, reasonText: context.reason(room.actions.disable) }),
      ].join("")
    : "";
  const robots = room.unreachable
    ? `<span class="voc-room-meta-item voc-room-warning">${icon("mdi:robot-vacuum-alert")}${e(context.t("rooms.unreachable"))}</span>${reasons}${remedies ? `<span class="voc-room-remedies">${remedies}</span>` : ""}`
    : room.robots.length
      ? `<span class="voc-room-meta-item">${icon("mdi:robot-vacuum")}${e(room.robots.join(", "))}</span>`
      : "";
  const work = room.work.map((entry) => `<span class="voc-room-meta-item" data-key="work:${e(entry.key)}" data-kind="${e(entry.kind)}" data-tone="${e(entry.tone)}">${icon(WORK_ICONS[entry.kind])}${e(entry.text)}</span>`).join("");
  const conditions = room.conditions
    .map((entry) =>
      entry.explain
        ? `<button type="button" class="voc-room-meta-item voc-room-conditions" data-key="condition:met" data-met="true" data-explain="${e(entry.explain)}" title="${e(entry.explain)}">${icon("mdi:check-circle-outline")}${e(entry.text)}</button>`
        : `<span class="voc-room-meta-item" data-key="condition:${e(entry.key)}" data-met="${entry.met}">${icon("mdi:door")}${e(entry.text)}</span>`
    )
    .join("");
  return `<article class="voc-room" data-key="room:${e(room.roomId)}"${room.enabled ? "" : ' data-excluded="true"'}><header class="voc-room-head"><span class="voc-room-icon" aria-hidden="true">${icon(room.icon)}</span><h3 class="voc-room-name">${e(room.name)}</h3></header><div class="voc-room-status">${pill(room.release.label, room.release.tone, { iconName: room.release.icon })}</div><div class="voc-room-due">${room.due.map(dueRow).join("")}</div>${work || robots || conditions ? `<div class="voc-room-meta">${work}${robots}${conditions}</div>` : ""}<div class="voc-room-actions">${actions}</div></article>`;
}

export function renderRooms(context, vm) {
  if (vm.error) return `<div class="voc-view voc-rooms" data-key="view:rooms">${errorState(context, vm.error)}</div>`;
  if (vm.loading) return `<div class="voc-view voc-rooms" data-key="view:rooms">${loadingState(context)}</div>`;
  const lockAll = vm.lockAll ? `<div class="voc-rooms-bar" data-key="lock-all"><span>${icon("mdi:lock-open-variant-outline")}${e(vm.lockAll.text)}</span>${button({ action: "lock-rooms", args: { roomIds: vm.lockAll.roomIds }, label: context.t("rooms.lockAll"), iconName: "mdi:lock-outline", decision: vm.lockAll.decision, reasonText: context.reason(vm.lockAll.decision) })}</div>` : "";
  const cards = vm.rooms.length ? `<div class="voc-room-grid">${vm.rooms.map((room) => roomCard(context, room)).join("")}</div>` : emptyState("mdi:floor-plan", context.t("rooms.empty"));
  const excluded = vm.excludedCount
    ? `<div class="voc-view-footer" data-key="excluded">${button({ action: "toggle", args: { key: "rooms:excluded" }, label: context.t(vm.showExcluded ? "rooms.hideExcluded" : "rooms.showExcluded", { count: vm.excludedCount }), iconName: vm.showExcluded ? "mdi:eye-off-outline" : "mdi:eye-outline", variant: "quiet" })}</div>`
    : "";
  return `<div class="voc-view voc-rooms" data-key="view:rooms">${lockAll}${cards}${excluded}</div>`;
}

export const roomsView = Object.freeze({
  key: "rooms",
  icon: "mdi:floor-plan",
  requires: ["get_rooms"],
  defaultEnabled: () => true,
  optionsSchema: Object.freeze({ show_disabled: boolOption(false) }),
  primary: Object.freeze({ action: "create-room", icon: "mdi:plus", labelKey: "action.createRoom", operation: "create_room", target: "create" }),
  scopes: () => [],
  build: ({ model, texts, context, options, config, ui }) => buildRoomsView({ model, texts, context, options, ui, timeFormat: config.time_format }),
  render: renderRooms,
  css: ROOMS_CSS,
});
