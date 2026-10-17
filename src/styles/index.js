// The stylesheet in slice order: tokens first, shell parts, shared blocks and menus, card dialogs, the
// frame, then the view slices injected by the composition root, responsive tiers and motion last.

import { BUTTONS_CSS } from "./buttons.js";
import { CARD_CSS } from "./card.js";
import { DIALOG_CSS } from "./dialog.js";
import { FRAME_CSS } from "./frame.js";
import { HEADER_CSS } from "./header.js";
import { MENU_CSS } from "./menu.js";
import { MOTION_CSS } from "./motion.js";
import { NOTICES_CSS } from "./notices.js";
import { OVERLAY_CSS } from "./overlay.js";
import { PANEL_CSS } from "./panel.js";
import { RESPONSIVE_CSS } from "./responsive.js";
import { TABS_CSS } from "./tabs.js";
import { TOKENS_CSS } from "./tokens.js";

export function buildStyles({ viewCss = [] } = {}) {
  return [TOKENS_CSS, CARD_CSS, HEADER_CSS, NOTICES_CSS, PANEL_CSS, TABS_CSS, BUTTONS_CSS, MENU_CSS, OVERLAY_CSS, DIALOG_CSS, FRAME_CSS, ...viewCss, RESPONSIVE_CSS, MOTION_CSS].join("");
}
