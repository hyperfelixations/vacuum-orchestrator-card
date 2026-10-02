// Overlay pages (detail, editors, dialogs) and the content blocks views share: section headings,
// panels, empty and loading states, onboarding.

export const OVERLAY_CSS = `
.voc-overlay { display: grid; gap: 12px; min-width: 0; }
.voc-overlay-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.voc-overlay-title:focus { outline: none; }
.voc-overlay-title { flex: 1; min-width: 0; margin: 0; font-size: 17px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.voc-overlay-lead { margin: 0; color: var(--voc-muted); font-size: 12.5px; font-weight: 650; line-height: 1.35; }
.voc-overlay-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 4px; }
.voc-overlay-actions .voc-action-start { margin-right: auto; }

.voc-block { display: grid; gap: 8px; min-width: 0; padding: 10px 12px; border-radius: 14px; background: var(--voc-panel); border: 1px solid var(--voc-hairline); }
.voc-block-title { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); }
.voc-block-title ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; }

.voc-group { display: grid; gap: 6px; min-width: 0; }
.voc-group-title { display: flex; align-items: baseline; gap: 6px; margin: 2px 2px 0; font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); }
.voc-group-count { font-variant-numeric: tabular-nums; letter-spacing: 0; }

.voc-facts { display: grid; grid-template-columns: max-content 1fr; gap: 5px 12px; margin: 0; font-size: 12px; line-height: 1.3; }
.voc-facts dt { color: var(--voc-muted); font-weight: 650; }
.voc-facts dd { margin: 0; min-width: 0; font-weight: 750; overflow-wrap: anywhere; }

.voc-reasons { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12px; font-weight: 650; line-height: 1.3; }
.voc-reasons li { display: flex; gap: 6px; align-items: flex-start; }
.voc-reasons ha-icon { --mdc-icon-size: 15px; width: 15px; height: 15px; flex: none; color: var(--voc-warning-ink); }

.voc-empty, .voc-loading, .voc-unavailable {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 18px 12px;
  border-radius: 14px;
  border: 1px dashed var(--voc-hairline);
  color: var(--voc-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.voc-empty > ha-icon, .voc-unavailable > ha-icon { --mdc-icon-size: 28px; width: 28px; height: 28px; color: var(--voc-faint); }
.voc-empty-hint { max-width: 420px; margin: 0; font-size: 12px; font-weight: 600; line-height: 1.4; color: var(--voc-muted); }
.voc-empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.voc-loading { border-style: solid; background: var(--voc-panel); }

.voc-onboarding { display: grid; gap: 12px; justify-items: start; padding: 14px; border-radius: 17px; background: var(--voc-panel); border: 1px solid var(--voc-hairline); }
.voc-onboarding-head { display: flex; align-items: center; gap: 10px; }
.voc-onboarding-head ha-icon { --mdc-icon-size: 26px; width: 26px; height: 26px; color: var(--tone-ink); }
.voc-onboarding-title { margin: 0; font-size: 16px; font-weight: 900; line-height: 1.2; }
.voc-onboarding-text { margin: 0; color: var(--voc-muted); font-size: 12.5px; font-weight: 650; line-height: 1.4; }
.voc-onboarding-steps { display: grid; gap: 6px; margin: 0; padding-left: 20px; font-size: 12.5px; font-weight: 700; line-height: 1.35; }
.voc-onboarding-note { margin: 0; font-size: 12px; font-weight: 700; color: var(--voc-muted); }
.voc-onboarding-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.voc-onboarding[data-busy="true"] ha-icon { animation: voc-pulse 1.4s ease-in-out infinite; }
@keyframes voc-pulse { 50% { opacity: .35; } }
`;
