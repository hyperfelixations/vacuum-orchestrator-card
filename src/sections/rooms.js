// Area status section. Target data is rendered fully; today's backend degrades visibly.

import { buildRoomsViewModel } from "../presentation/sections/rooms-vm.js";
import { e, emptyState, icon, setText, t, unavailable } from "./render-utils.js";

// Overdue is urgent, due is a warning, clean is fine; no data says nothing either way.
function dueTone(row) {
  if (row.overdue) return "attention";
  if (row.dueState === "clean") return "ready";
  if (row.dueState === "unknown") return "idle";
  return "paused";
}

function remainingText(context, row) {
  return row.overdue ? t(context, "time.overdue") : t(context, "time.remaining", { value: row.remainingLabel });
}

// Which cleaning the timestamp belongs to has to be readable, not only guessable from an icon.
function roomTime(context, iconName, labelKey, value) {
  return `<span class="voc-room-time">${icon(context, iconName)}<span class="voc-room-time-label">${e(t(context, labelKey))}</span><span>${e(value)}</span></span>`;
}

function roomRow(context, row) {
  const progress = row.progress === null ? "" : `<div class="voc-room-progress" role="progressbar" aria-valuemin="0" aria-valuemax="1" aria-valuenow="${row.progress}" aria-label="${e(t(context, "room.dueProgress"))}" data-overdue="${row.overdue}" style="--voc-progress:${row.progress}"><span></span></div>`;
  const release = row.release
    ? `<div class="voc-room-release" data-release-entity="${e(row.release.entityId)}"><span id="voc-release-label-${e(row.areaId)}">${e(row.release.label)}</span><button type="button" class="voc-control voc-switch${row.release.checked ? " is-checked" : ""}" data-control="switch" data-action="toggle-release" data-entity-id="${e(row.release.entityId)}" role="switch" aria-checked="${row.release.checked}" aria-labelledby="voc-release-label-${e(row.areaId)}"${row.release.available ? "" : ' aria-disabled="true"'}><span class="voc-switch-thumb" aria-hidden="true"></span></button></div>`
    : "";
  const blocking = row.blockingEntities.length
    ? `<div class="voc-room-blockers"><span>${e(t(context, "room.blockedBy"))}</span><ul>${row.blockingEntities.map((entity) => `<li>${e(entity.label)}</li>`).join("")}</ul></div>`
    : "";
  const remaining = row.hasSchedule ? `<div class="voc-room-remaining">${e(remainingText(context, row))}</div>` : "";
  return `<article class="voc-room-row" data-room-id="${e(row.areaId)}"><div class="voc-room-icon" aria-hidden="true">${icon(context, row.icon)}</div><div class="voc-room-main"><div class="voc-room-heading"><h3>${e(row.name)}</h3><span class="voc-room-due voc-tone-${e(dueTone(row))}">${e(row.dueStateLabel)}</span></div><div class="voc-room-times">${roomTime(context, "mdi:robot-vacuum", "room.lastVacuumed", row.lastVacuumedLabel)}${roomTime(context, "mdi:water", "room.lastMopped", row.lastMoppedLabel)}</div>${progress}${remaining}${blocking}</div>${release}</article>`;
}

export const roomsSection = {
  key: "rooms",

  build(model, texts, options = {}, ui) {
    return buildRoomsViewModel({ model, texts, nowMs: options.nowMs ?? null, ui });
  },

  structureSignature(content) {
    return `${content.available ? "available" : "unavailable"}|${content.empty ? "empty" : "rows"}|${content.rows.map((row) => `${row.areaId}:${row.release ? 1 : 0}:${row.blockingEntities.length}`).join("|")}`;
  },

  render(context, viewModel) {
    if (!viewModel.available) return `<section class="voc-section voc-rooms-section" data-section="rooms">${unavailable(context, viewModel.unavailable)}</section>`;
    const body = viewModel.empty ? emptyState(context, "rooms") : viewModel.rows.map((row) => roomRow(context, row)).join("");
    return `<section class="voc-section voc-rooms-section" data-section="rooms"><h2 class="voc-section-title">${e(t(context, "section.rooms"))}</h2>${body}</section>`;
  },

  patch(context, root, viewModel) {
    const section = root?.matches?.(".voc-rooms-section") ? root : root?.querySelector?.(".voc-rooms-section");
    if (!section || !viewModel.available) return;
    for (const row of viewModel.rows) {
      const element = [...section.querySelectorAll(".voc-room-row")].find((candidate) => candidate.dataset.roomId === row.areaId);
      if (!element) continue;
      setText(element, ".voc-room-due", row.dueStateLabel);
      setText(element, ".voc-room-remaining", remainingText(context, row));
      const toggle = element.querySelector('[data-action="toggle-release"]');
      if (toggle && row.release) {
        toggle.setAttribute("aria-checked", String(row.release.checked));
        toggle.classList.toggle("is-checked", row.release.checked);
      }
    }
  },
};

export default roomsSection;
