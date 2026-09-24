import { TOKENS_CSS } from "./tokens.js";
import { CARD_CSS } from "./card.js";
import { HEADER_CSS } from "./header.js";
import { STATS_CSS } from "./stats.js";
import { TABS_CSS } from "./tabs.js";
import { BUTTONS_CSS } from "./buttons.js";
import { NOTICES_CSS } from "./notices.js";
import { OVERLAY_CSS } from "./overlay.js";
import { RESPONSIVE_CSS } from "./responsive.js";
import { MOTION_CSS } from "./motion.js";

export function buildStyles({ sectionCss = [] } = {}) {
  return [TOKENS_CSS, CARD_CSS, HEADER_CSS, STATS_CSS, TABS_CSS, BUTTONS_CSS, NOTICES_CSS, OVERLAY_CSS, RESPONSIVE_CSS, MOTION_CSS, ...sectionCss].join("");
}
