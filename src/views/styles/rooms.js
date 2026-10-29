// Rooms view: room cards with due bars, release state, robots and conditions. Cards of a row are
// equally tall and end with their actions at the same line (LAY-15).

export const ROOMS_CSS = `
.voc-room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); align-items: stretch; gap: 8px; }
.voc-room { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 10px 8px 12px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); }
.voc-room[data-excluded="true"] { opacity: .65; }
.voc-room-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.voc-room-icon { display: flex; flex: none; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 10px; background: var(--voc-panel); color: var(--voc-muted); }
.voc-room-icon ha-icon { --mdc-icon-size: 17px; }
.voc-room-name { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 900; }
.voc-room-status { display: flex; flex-wrap: wrap; gap: 4px; margin-top: -2px; }

.voc-room-due { display: grid; gap: 6px; }
.voc-due { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; align-items: center; }
.voc-due-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 850; letter-spacing: .03em; color: var(--voc-faint); text-transform: uppercase; }
.voc-due-label ha-icon { --mdc-icon-size: 14px; }
.voc-due--none { display: flex; gap: 4px; font-size: 12px; font-weight: 650; color: var(--voc-faint); }
.voc-due--none ha-icon { --mdc-icon-size: 14px; }
.voc-due-status { justify-self: end; display: inline-flex; align-items: center; gap: 4px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: 12px; font-weight: 800; text-align: right; }
button.voc-due-status { cursor: help; }
.voc-due-basis { display: inline-flex; color: var(--voc-faint); }
.voc-due-basis ha-icon { --mdc-icon-size: 14px; }
.voc-due-mark { margin-left: -2px; color: var(--voc-muted); }
.voc-due-bar { grid-column: 1 / -1; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 9%, transparent); overflow: hidden; }
.voc-due-bar span { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--voc-success) 75%, transparent); }
.voc-due[data-due="due"] .voc-due-bar span { background: var(--voc-warning); }
.voc-due[data-due="due"] .voc-due-status { color: var(--voc-warning-ink); }
.voc-due[data-due="unknown"] .voc-due-bar span { background: var(--voc-faint); }
.voc-due[data-due="disabled"] .voc-due-status { color: var(--voc-faint); font-weight: 700; }
.voc-due-last { grid-column: 1 / -1; font-size: 11px; font-weight: 650; color: var(--voc-muted); }

.voc-room-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; font-weight: 650; color: var(--voc-muted); }
.voc-room-meta-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.voc-room-meta-item ha-icon { --mdc-icon-size: 14px; }
.voc-room-warning { color: var(--voc-warning-ink); font-weight: 750; }
.voc-room-reason { padding-left: 18px; }
.voc-room-remedies { display: flex; flex-wrap: wrap; gap: 2px 4px; width: 100%; padding-left: 10px; }
.voc-room .voc-room-remedy { min-height: 28px; padding: 2px 8px; border-color: transparent; background: transparent; color: var(--voc-accent-ink); font-size: 11.5px; }
.voc-room .voc-room-remedy ha-icon { --mdc-icon-size: 15px; }
@media (hover: hover) { .voc-room .voc-room-remedy:hover { background: var(--voc-accent-soft); } }
.voc-rooms-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; font-size: 12px; font-weight: 750; color: var(--voc-muted); }
.voc-rooms-bar > span { display: inline-flex; align-items: center; gap: 6px; }
.voc-rooms-bar > span ha-icon { --mdc-icon-size: 16px; color: var(--voc-success); }
.voc-room-meta-item[data-tone="running"] { color: var(--voc-accent-ink); font-weight: 750; }
.voc-room-meta-item[data-met="false"] { color: var(--voc-warning-ink); }
button.voc-room-conditions { padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: help; }
/* At the card's foot whatever the card above holds, so the actions of a row line up. */
.voc-room-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--voc-target-gap); margin: auto -4px 0; }
.voc-room-actions .voc-button { padding: 4px 10px; }
.voc-view-footer { display: flex; justify-content: center; }
`;
