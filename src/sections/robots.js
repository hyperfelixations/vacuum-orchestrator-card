// Robot target-contract section with explicit capability degradation.

import { buildRobotsViewModel } from "../presentation/sections/robots-vm.js";
import { e, emptyState, icon, t, unavailable } from "./render-utils.js";

function robotRow(context, row) {
  const mapUrl = row.mapImageEntityId ? context.resolveImage?.(row.mapImageEntityId) : null;
  const map = mapUrl ? `<img class="voc-robot-map" src="${e(mapUrl)}" loading="lazy" alt="${e(row.mapAlt)}">` : "";
  const chips = (items, labelKey) =>
    items.length
      ? `<div class="voc-robot-chip-group"><span class="voc-robot-chip-label">${e(t(context, labelKey))}</span><div class="voc-robot-chip-list">${items.map((item) => `<span class="voc-robot-chip">${e(item)}</span>`).join("")}</div></div>`
      : "";
  const operations = chips(row.operations.map((operation) => operation.label), "robot.operations");
  const allowed = chips(row.allowedAreas.map((area) => area.name), "robot.allowedAreas");
  return `<article class="voc-robot-card" data-robot-id="${e(row.robotId)}"><div class="voc-robot-header"><div class="voc-robot-icon" aria-hidden="true">${icon(context, "mdi:robot-vacuum")}</div><div><h3>${e(row.name)}</h3><span class="voc-robot-availability voc-tone-${e(row.availabilityTone)}">${e(row.availabilityLabel)}</span></div></div><div class="voc-robot-status" data-robot-battery="true"><span>${icon(context, "mdi:battery")}${e(t(context, "robot.battery"))}</span><strong>${e(row.batteryLabel)}</strong></div><div class="voc-robot-active"><span>${e(t(context, "robot.activeJob"))}</span><span>${e(row.activeJobLabel || t(context, "form.notSet"))}</span></div>${row.activeAreaLabel ? `<div class="voc-robot-active"><span>${e(t(context, "robot.activeArea"))}</span><span>${e(row.activeAreaLabel)}</span></div>` : ""}${row.blockedReason ? `<div class="voc-robot-blocked" role="status">${e(row.blockedReason)}</div>` : ""}<div class="voc-robot-capabilities">${operations}${allowed}${row.maxPasses !== null ? `<span class="voc-robot-max-passes">${e(t(context, "robot.maxPasses"))}: ${e(row.maxPasses)}</span>` : ""}</div>${map}</article>`;
}

export const robotsSection = {
  key: "robots",

  build(model, texts, options = {}, ui) {
    return buildRobotsViewModel({ model, texts, options, ui });
  },

  structureSignature(content) {
    return `${content.available ? "available" : "unavailable"}|${content.empty ? "empty" : "rows"}|${content.rows.map((row) => `${row.robotId}:${row.mapImageEntityId ? 1 : 0}:${row.blockedReason ? 1 : 0}`).join("|")}`;
  },

  render(context, viewModel) {
    if (!viewModel.available) return `<section class="voc-section voc-robots-section" data-section="robots">${unavailable(context, viewModel.unavailable)}</section>`;
    const body = viewModel.empty ? emptyState(context, "robots") : viewModel.rows.map((row) => robotRow(context, row)).join("");
    return `<section class="voc-section voc-robots-section" data-section="robots"><h2 class="voc-section-title">${e(t(context, "section.robots"))}</h2><div class="voc-robot-grid">${body}</div></section>`;
  },

  patch(_context, root, viewModel) {
    const section = root?.matches?.(".voc-robots-section") ? root : root?.querySelector?.(".voc-robots-section");
    if (!section || !viewModel.available) return;
    for (const row of viewModel.rows) {
      const element = [...section.querySelectorAll(".voc-robot-card")].find((candidate) => candidate.dataset.robotId === row.robotId);
      if (!element) continue;
      const availability = element.querySelector(".voc-robot-availability");
      if (availability) availability.textContent = row.availabilityLabel;
      const battery = element.querySelector("[data-robot-battery] strong");
      if (battery) battery.textContent = row.batteryLabel;
    }
  },
};

export default robotsSection;
