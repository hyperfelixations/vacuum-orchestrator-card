// Width tiers as container queries on `ha-card` (RCC responsive slice, LAY-02): compact below
// 400 px, narrow below 560 px, medium below 900 px, wide from 900 px. Narrow cards stack the
// panel: the figure, beside it the labelled queue controls while they fit (they wrap below it
// otherwise), the run state underneath (LAY-10, LAY-21). Tab and action labels follow the
// measured tab row (tab strip runtime), not the tier. A media-query fallback covers engines
// without container queries. View slices add their own rules inside the same tiers.

export const RESPONSIVE_CSS = `
@container voc-card (max-width: 559px) {
  .voc-root { --voc-pad-top: 14px; --voc-pad-x: 14px; --voc-pad-bottom: 14px; }
  .voc-tabs { gap: 2px; }
  .voc-panel { display: flex; flex-wrap: wrap; gap: 8px 10px; }
  .voc-panel-headline { flex: 1 0 auto; }
  .voc-panel-control { order: 1; margin-left: auto; }
  .voc-panel-status { order: 2; flex: 1 1 100%; }
  .voc-panel-value { font-size: 29px; }
}

@container voc-card (max-width: 399px) {
  .voc-header { gap: 9px; }
  .voc-header-action .voc-button-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .voc-header-action .voc-button { width: var(--voc-icon-target); min-height: var(--voc-icon-target); padding: 0; }
}

@supports not (container-type: inline-size) {
  @media (max-width: 699px) {
    .voc-root { --voc-pad-top: 14px; --voc-pad-x: 14px; --voc-pad-bottom: 14px; }
  }
}
`;
