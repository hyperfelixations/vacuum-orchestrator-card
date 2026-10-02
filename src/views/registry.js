// The one composition point of views and overlays. Each view declares the integration
// operations it needs, its default visibility, its closed option schema, the primary action of
// the tab row, the scopes it reads, and build/render. See internal dev doc §8 "View-Registry".

import { e } from "../render/primitives/markup.js";
import { renderOnboarding } from "./onboarding.js";
import { queueView } from "./queue.js";
import { roomsView } from "./rooms.js";
import { robotsView } from "./robots.js";
import { templatesView } from "./templates.js";
import { historyView } from "./history.js";
import { diagnosticsView } from "./diagnostics.js";
import { setupView } from "./setup.js";
import { settingsView } from "./settings.js";
import { robotAddOverlay, robotEditorOverlay } from "./overlays/robots.js";
import { releaseOverlay, roomCreateOverlay, roomEditorOverlay } from "./overlays/rooms.js";
import { jobEditorOverlay } from "./overlays/job-editor.js";
import { jobDetailOverlay } from "./overlays/job-detail.js";
import { confirmOverlay, queueSettingsOverlay, recoveryOverlay, startJobOverlay } from "./overlays/dialogs.js";

export const VIEWS = Object.freeze([setupView, queueView, roomsView, robotsView, templatesView, historyView, diagnosticsView, settingsView]);
export const OVERLAYS = Object.freeze([jobEditorOverlay, jobDetailOverlay, confirmOverlay, startJobOverlay, recoveryOverlay, queueSettingsOverlay, releaseOverlay, roomEditorOverlay, roomCreateOverlay, robotAddOverlay, robotEditorOverlay]);

function verify() {
  const keys = new Set();
  for (const entry of [...VIEWS, ...OVERLAYS]) {
    if (keys.has(entry.key)) throw new Error(`view registry: duplicate key ${entry.key}`);
    keys.add(entry.key);
    for (const name of ["build", "render"]) {
      if (typeof entry[name] !== "function") throw new Error(`view registry: ${entry.key} lacks ${name}`);
    }
  }
}
verify();

export const VIEW_TYPES = Object.freeze(VIEWS.map((view) => view.key));
export const VIEW_CSS = Object.freeze([...new Set([...VIEWS, ...OVERLAYS].map((entry) => entry.css).filter(Boolean))]);

export function viewFor(key) {
  return VIEWS.find((view) => view.key === key) || null;
}

export function overlayFor(key) {
  return OVERLAYS.find((overlay) => overlay.key === key) || null;
}

export function optionSchemaForView(key) {
  return viewFor(key)?.optionsSchema || null;
}

export function renderBody(context, body) {
  if (body.kind === "onboarding") return renderOnboarding(context, body.content);
  if (body.kind === "view") return viewFor(body.key)?.render(context, body.content) ?? "";
  if (body.kind === "overlay") return overlayFor(body.key)?.render(context, body.content) ?? "";
  return `<div class="voc-unavailable" data-key="${e(body.kind)}" role="status">${e(body.message || "")}</div>`;
}
