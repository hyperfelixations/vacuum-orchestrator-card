// Touch targets (LAY-13, WCAG 2.5.5): under a coarse pointer every control activates on at least
// 44 × 44 px. A button, tab or option that looks smaller reaches beyond its box with an invisible
// layer, so its look and the rhythm around it stay; fields, disclosures and switch rows are 44 px
// tall themselves. See internal dev doc §9 "Designsprache".

export const TARGETS_CSS = `
@media (pointer: coarse) {
  .voc-option, .voc-setup-open, .voc-due-status, .voc-room-conditions { position: relative; }
  :is(.voc-button, .voc-tab, .voc-option, .voc-setup-open, .voc-due-status, .voc-room-conditions)::before { content: ""; position: absolute; inset: min(0px, (100% - 44px) / 2); }
  .voc-input, .voc-disclosure, .voc-switch { min-height: 44px; }
}
`;
