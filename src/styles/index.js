// The stylesheet in slice order: tokens first, shell parts, shared blocks, then the view slices
// injected by the composition root, responsive tiers and motion last.

import { BUTTONS_CSS } from "./buttons.js";
import { CARD_CSS } from "./card.js";
import { HEADER_CSS } from "./header.js";
import { MOTION_CSS } from "./motion.js";
import { NOTICES_CSS } from "./notices.js";
import { OVERLAY_CSS } from "./overlay.js";
import { PANEL_CSS } from "./panel.js";
import { RESPONSIVE_CSS } from "./responsive.js";
import { TABS_CSS } from "./tabs.js";
import { TOKENS_CSS } from "./tokens.js";

export function buildStyles({ viewCss = [] } = {}) {
  return [TOKENS_CSS, CARD_CSS, HEADER_CSS, NOTICES_CSS, PANEL_CSS, TABS_CSS, BUTTONS_CSS, OVERLAY_CSS, ...viewCss, RESPONSIVE_CSS, MOTION_CSS].join("");
}
