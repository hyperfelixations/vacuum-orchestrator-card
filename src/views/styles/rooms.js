// Rooms view: room cards with due bars, release state, robots and conditions; the actions sit
// on the card floor, so cards side by side keep them on one line.

export const ROOMS_CSS = `
.voc-room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.voc-room { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 10px 8px 12px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); }
.voc-room[data-excluded="true"] { opacity: .65; }
.voc-room-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.voc-room-icon { display: flex; flex: none; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 10px; background: var(--voc-panel); color: var(--voc-muted); }
.voc-room-icon ha-icon { --mdc-icon-size: 17px; width: 17px; height: 17px; }
.voc-room-name { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 900; }
.voc-room-head .voc-button--icon { margin: -4px -4px -4px 0; }
.voc-room-status { display: flex; flex-wrap: wrap; gap: 4px; margin-top: -2px; }

.voc-room-due { display: grid; gap: 6px; }
.voc-due { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; align-items: center; }
.voc-due-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 850; letter-spacing: .03em; color: var(--voc-faint); text-transform: uppercase; }
.voc-due-label ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; }
.voc-due-status { justify-self: end; font-size: 12px; font-weight: 800; }
.voc-due-bar { grid-column: 1 / -1; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 9%, transparent); overflow: hidden; }
.voc-due-bar span { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--voc-success) 75%, transparent); }
.voc-due[data-due="due"] .voc-due-bar span { background: var(--voc-warning); }
.voc-due[data-due="due"] .voc-due-status { color: var(--voc-warning-ink); }
.voc-due[data-due="unknown"] .voc-due-bar span { background: var(--voc-faint); }
.voc-due[data-due="disabled"] .voc-due-status { color: var(--voc-faint); font-weight: 700; }
.voc-due-last { grid-column: 1 / -1; font-size: 11px; font-weight: 650; color: var(--voc-muted); }
.voc-due-quality[data-quality="confirmed"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); font-weight: 750; }

.voc-room-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; font-weight: 650; color: var(--voc-muted); }
.voc-room-meta-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.voc-room-meta-item ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; flex: none; }
.voc-room-warning { color: var(--voc-warning-ink); font-weight: 750; }
.voc-room-actions { display: flex; flex-wrap: wrap; gap: var(--voc-target-gap); margin: auto -4px 0; }
.voc-room-toggle { margin-left: auto; }
.voc-room-actions .voc-button { padding: 4px 10px; }
.voc-view-footer { display: flex; justify-content: center; }
`;
