// Robots view: robot cards with live state, notes, folded capabilities and map picture. A single
// robot takes the whole width; a card wide enough sets its map beside its facts.

export const ROBOTS_CSS = `
.voc-robot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); align-items: start; gap: 8px; }
.voc-robot { display: grid; gap: 8px; align-content: start; min-width: 0; padding: 10px 10px 10px 12px; border-radius: 14px; background: var(--voc-chip-bg); border: 1px solid var(--voc-hairline); container: voc-robot / inline-size; }
.voc-robot-body, .voc-robot-info { display: grid; gap: 8px; align-content: start; min-width: 0; }
.voc-robot-capabilities { display: grid; gap: 6px; }
@container voc-robot (min-width: 520px) {
  .voc-robot-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 12px; }
}
.voc-robot-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.voc-robot-icon { display: flex; flex: none; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 12px; background: var(--voc-panel); border: 1px solid var(--voc-hairline); color: var(--voc-muted); }
.voc-robot[data-tone="running"] .voc-robot-icon { color: var(--voc-info); border-color: color-mix(in srgb, var(--voc-info) 40%, transparent); }
.voc-robot[data-tone="attention"] .voc-robot-icon { color: var(--voc-error); border-color: color-mix(in srgb, var(--voc-error) 40%, transparent); }
.voc-robot-icon ha-icon { --mdc-icon-size: 21px; }
.voc-robot-title { flex: 1; min-width: 0; display: grid; gap: 3px; }
.voc-robot-name { margin: 0; font-size: 14.5px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-robot-state { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.voc-robot-battery { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.voc-robot-battery ha-icon { --mdc-icon-size: 15px; color: var(--voc-muted); }
.voc-robot-facts { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; font-weight: 700; color: var(--voc-muted); }
.voc-robot-fact { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.voc-robot-fact ha-icon, .voc-robot-line ha-icon, .voc-robot-note ha-icon { --mdc-icon-size: 15px; }
.voc-robot-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px; background: var(--voc-panel); font-size: 12px; font-weight: 700; }
.voc-robot-note span { flex: 1; min-width: 0; }
.voc-robot-note[data-tone="running"] { color: color-mix(in srgb, var(--voc-info) 80%, var(--primary-text-color)); }
.voc-robot-note[data-tone="attention"] { background: color-mix(in srgb, var(--voc-error) 9%, transparent); color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-robot-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.voc-robot-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.voc-robot-line { display: flex; align-items: flex-start; gap: 5px; font-size: 12px; font-weight: 650; color: var(--voc-muted); }
.voc-robot-levels { display: grid; gap: 2px; font-size: 11.5px; font-weight: 600; color: var(--voc-faint); }
.voc-robot-map { display: grid; gap: 6px; justify-items: start; margin: 0; }
.voc-robot-map-open { display: block; max-width: 100%; padding: 0; border: 0; border-radius: 12px; background: none; cursor: zoom-in; }
.voc-robot-map-open:focus-visible { outline: 2px solid var(--voc-focus); outline-offset: 2px; }
.voc-map-stage { position: relative; width: 100%; min-height: 120px; overflow: hidden; }
.voc-map-stage img { position: absolute; display: block; max-width: none; border-radius: 12px; background: var(--voc-panel); transform-origin: center; }
.voc-robot-map img { display: block; width: auto; max-width: 100%; height: auto; max-height: 240px; border-radius: 12px; background: var(--voc-panel); border: 1px solid var(--voc-hairline); }
.voc-alert--info { background: color-mix(in srgb, var(--voc-info) 8%, transparent); border-color: color-mix(in srgb, var(--voc-info) 38%, transparent); }
.voc-alert--info > ha-icon { color: color-mix(in srgb, var(--voc-info) 80%, var(--primary-text-color)); }
`;
