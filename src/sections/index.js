// The section layer's public surface: definitions, renderers, overlays, style slices and the
// two control hooks the element wires into its event runtimes.

import { SECTION_CSS } from "./styles/index.js";
import { SECTION_DEFINITIONS, SECTION_RENDERERS, rendererForSection } from "./registry.js";
import { confirmOverlay } from "./overlays/confirm.js";
import { jobDetailOverlay } from "./overlays/job-detail.js";
import { jobEditorOverlay } from "./overlays/job-editor.js";
export { filterEntityOptions, handleControlKeydown } from "./controls/index.js";

export const OVERLAY_RENDERERS = Object.freeze([jobEditorOverlay, jobDetailOverlay, confirmOverlay]);

export { SECTION_DEFINITIONS, SECTION_RENDERERS, SECTION_CSS, rendererForSection };

export function optionSchemaForSection(key) {
  return SECTION_DEFINITIONS.find((definition) => definition.key === key)?.optionsSchema || null;
}
