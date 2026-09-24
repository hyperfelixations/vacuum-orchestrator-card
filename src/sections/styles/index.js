import { CONTROLS_CSS } from "./controls.js";
import { DIAGNOSTICS_CSS } from "./diagnostics.js";
import { EDITOR_CSS } from "./editor.js";
import { HISTORY_CSS } from "./history.js";
import { QUEUE_CSS } from "./queue.js";
import { ROBOTS_CSS } from "./robots.js";
import { ROOMS_CSS } from "./rooms.js";

export const SECTION_CSS = Object.freeze([
  QUEUE_CSS,
  HISTORY_CSS,
  ROOMS_CSS,
  ROBOTS_CSS,
  DIAGNOSTICS_CSS,
  EDITOR_CSS,
  CONTROLS_CSS,
]);

export function buildSectionStyles() {
  return SECTION_CSS.join("");
}
