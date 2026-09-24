export const RESPONSIVE_CSS = `
@container voc-card (max-width: 839px) {
  .voc-header { gap: 8px; }
  .voc-stats { gap: 5px; }
}

@container voc-card (max-width: 559px) {
  .voc-root { padding: 14px; }
  .voc-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .voc-tab-label { display: none; }
  .voc-tab-short { display: inline; }
  .voc-button { min-height: 44px; }
  /* Only the primary action loses its words; its accessible name stays in aria-label. */
  .voc-primary-action .voc-button-label { display: none; }
  .voc-queue-controls { display: grid; }
  .voc-queue-controls .voc-button { width: 100%; }
}

@container voc-card (max-width: 379px) {
  .voc-tabs { scroll-snap-type: x mandatory; }
  .voc-tab { scroll-snap-align: start; }
  .voc-header { grid-template-columns: auto minmax(0, 1fr); }
  .voc-header .voc-pill { grid-column: 1 / -1; justify-self: start; }
}

@supports not (container-type: inline-size) {
  @media (max-width: 979px) {
    .voc-header { gap: 8px; }
    .voc-stats { gap: 5px; }
  }
  @media (max-width: 699px) {
    .voc-root { padding: 14px; }
    .voc-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .voc-tab-label { display: none; }
    .voc-tab-short { display: inline; }
    .voc-button { min-height: 44px; }
    .voc-primary-action .voc-button-label { display: none; }
    .voc-queue-controls { display: grid; }
    .voc-queue-controls .voc-button { width: 100%; }
  }
  @media (max-width: 519px) {
    .voc-tabs { scroll-snap-type: x mandatory; }
    .voc-tab { scroll-snap-align: start; }
  }
}
`;
