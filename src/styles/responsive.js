// Width tiers as container queries on `ha-card` (RCC responsive slice): below 560 px the card
// stacks, below 400 px it compacts; a media-query fallback covers engines without container
// queries. View slices add their own rules inside the same tiers.

export const RESPONSIVE_CSS = `
@container voc-card (max-width: 559px) {
  .voc-root { --voc-pad-top: 14px; --voc-pad-x: 14px; --voc-pad-bottom: 14px; }
  .voc-tabs { gap: 2px; }
  .voc-tab:not([aria-selected="true"]) { min-width: var(--voc-icon-target); justify-content: center; padding: 6px 7px; }
  .voc-tab:not([aria-selected="true"]) .voc-tab-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .voc-primary-action .voc-button-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .voc-primary-action { width: var(--voc-icon-target); min-height: var(--voc-icon-target); padding: 0; }
  .voc-panel { grid-template-columns: minmax(70px, auto) minmax(0, 1fr) auto; }
  .voc-panel-value { font-size: 29px; }
}

@container voc-card (max-width: 399px) {
  .voc-header { gap: 9px; }
  .voc-panel { grid-template-columns: minmax(0, 1fr) auto; }
  .voc-panel-status { grid-column: 1 / -1; grid-row: 2; }
  .voc-queue-control .voc-button-label, .voc-queue-end .voc-button-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .voc-queue-control, .voc-queue-end { width: var(--voc-icon-target); min-height: var(--voc-icon-target); padding: 0; }
}

@supports not (container-type: inline-size) {
  @media (max-width: 699px) {
    .voc-root { --voc-pad-top: 14px; --voc-pad-x: 14px; --voc-pad-bottom: 14px; }
    .voc-tab:not([aria-selected="true"]) { min-width: var(--voc-icon-target); justify-content: center; padding: 6px 7px; }
    .voc-tab:not([aria-selected="true"]) .voc-tab-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .voc-primary-action .voc-button-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  }
}
`;
