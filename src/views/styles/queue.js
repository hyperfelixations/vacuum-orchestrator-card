// Queue view: job rows (title, what the job asks for, status, progress, main action and menu),
// attention and recovery alerts, template quick starts and pagination. The job row is shared with
// the history view: title and details on the left, the actions on the right, centred on the row
// while the title fits beside them (`data-title="fits"`, row-fit runtime), else below a title
// across the row (UI-32, LAY-09); the row's button spans both lines through a subgrid, so the
// whole row opens the job.

export const QUEUE_CSS = `
.voc-view { display: grid; gap: 12px; min-width: 0; }

.voc-job {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 6px;
  row-gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 6px 6px 6px 8px;
  border-radius: 14px;
  background: var(--voc-chip-bg);
  border: 1px solid var(--voc-hairline);
}

.voc-job + .voc-job { margin-top: 6px; }
.voc-job[data-tone="running"] { border-color: color-mix(in srgb, var(--voc-info) 40%, transparent); background: color-mix(in srgb, var(--voc-info) 7%, transparent); }
.voc-job[data-tone="attention"] { border-color: color-mix(in srgb, var(--voc-error) 40%, transparent); background: color-mix(in srgb, var(--voc-error) 6%, transparent); }
.voc-job[data-pending="true"]::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--voc-accent), transparent);
  background-size: 200% 100%;
  animation: voc-progress 1.2s linear infinite;
}
@keyframes voc-progress { from { background-position: 100% 0; } to { background-position: -100% 0; } }

.voc-job-lead { grid-column: 1; grid-row: 1; display: flex; justify-content: center; color: var(--voc-faint); }
.voc-job-lead ha-icon { --mdc-icon-size: 18px; }
.voc-job-position { font-size: 13px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--voc-faint); }

.voc-job-main {
  grid-column: 2 / -1;
  grid-row: 1 / span 2;
  display: grid;
  grid-template-columns: subgrid;
  grid-template-rows: subgrid;
  row-gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.voc-job-main:active { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }

.voc-job-title-line { grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
/* At most two lines, so a long room list stays readable without pushing the row apart; the end
   padding, taken back by the margin, keeps glyphs that reach past their advance clear of the clip. */
.voc-job-title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; min-width: 0; overflow: hidden; overflow-wrap: anywhere; padding-inline-end: 0.1em; margin-inline-end: -0.1em; font-size: 13.5px; font-weight: 850; line-height: 1.2; }
.voc-job-body { grid-column: 1; grid-row: 2; display: grid; gap: 3px; min-width: 0; }
.voc-job[data-actions="none"] .voc-job-body { grid-column: 1 / -1; }
.voc-job-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; font-size: 11.5px; font-weight: 700; line-height: 16px; color: var(--voc-muted); }
.voc-job-meta .voc-chip { padding: 0 6px; line-height: 14px; }
.voc-job-mode { display: inline-flex; align-items: center; gap: 3px; }
.voc-job-mode ha-icon { --mdc-icon-size: 14px; }
.voc-job-rooms { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-job-status, .voc-job-outcome { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11.5px; font-weight: 750; line-height: 1.25; }
.voc-job-status span, .voc-job-outcome span { min-width: 0; overflow-wrap: anywhere; text-wrap: pretty; }
.voc-job-status ha-icon, .voc-job-outcome ha-icon { --mdc-icon-size: 14px; }
.voc-job-status[data-tone="ready"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
.voc-job-status[data-tone="delay"] { color: color-mix(in srgb, var(--voc-info) 82%, var(--primary-text-color)); }
.voc-job-status[data-tone="blocked"] { color: var(--voc-warning-ink); }
.voc-job-status[data-tone="waiting"], .voc-job-status[data-tone="edit"] { color: var(--voc-muted); }
.voc-job-status[data-tone="muted"] { color: var(--voc-faint); }
.voc-job-status[data-tone="attention"], .voc-job-outcome { color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-job-progress { display: grid; gap: 3px; min-width: 0; font-size: 11.5px; font-weight: 700; line-height: 16px; color: var(--voc-muted); }
.voc-job-progress-line { min-width: 0; overflow-wrap: anywhere; text-wrap: pretty; }
.voc-job-percents { display: flex; flex-wrap: wrap; gap: 2px 12px; }
.voc-job-percent { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.voc-progress { position: relative; display: block; width: 72px; height: 4px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, var(--voc-info) 18%, transparent); }
.voc-progress > span { display: block; height: 100%; border-radius: 2px; background: var(--voc-info); }
.voc-job-actions .voc-job-main-action { min-height: var(--voc-row-target); padding-inline: 10px; }
.voc-job[data-actions="none"] { grid-template-columns: 30px minmax(0, 1fr); }
/* Above the row's button, in the column its subgrid leaves free; with its menu open above the
   actions of the rows below as well. */
.voc-job-actions { grid-column: 3; grid-row: 2; position: relative; z-index: 1; display: flex; align-items: center; gap: var(--voc-target-gap); }
.voc-job-actions:has(.voc-menu) { z-index: 4; }
.voc-job .voc-menu-button { width: var(--voc-row-target); min-width: var(--voc-row-target); min-height: var(--voc-row-target); }
.voc-job[data-title="fits"] .voc-job-title-line { grid-column: 1; }
.voc-job[data-title="fits"] .voc-job-actions { grid-row: 1 / span 2; }

.voc-alerts { display: grid; gap: 6px; }
.voc-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 11px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--voc-error) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--voc-error) 38%, transparent);
}
.voc-alert > ha-icon { --mdc-icon-size: 22px; color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-alert-text { display: grid; gap: 2px; flex: 1; min-width: 0; font-size: 12px; font-weight: 650; line-height: 1.3; color: var(--voc-muted); }
.voc-alert-text strong { color: var(--primary-text-color); font-size: 13px; font-weight: 850; }

/* The label beside its chips; chips that wrap line up under the first one. */
.voc-quick { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
.voc-quick-label { display: flex; align-items: center; min-height: var(--voc-control); font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); }
.voc-quick-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }

.voc-pagination { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 750; color: var(--voc-muted); }

@container voc-card (max-width: 559px) {
  .voc-job { grid-template-columns: 22px minmax(0, 1fr) auto; }
}

/* In very little room, as large text leaves a narrow card, a row's main action shows its icon so
   the job's title and status keep the row; the label stays its accessible name. */
@container voc-card (max-width: 339px) {
  .voc-job-actions .voc-job-main-action { width: var(--voc-row-target); min-width: var(--voc-row-target); padding: 0; justify-content: center; }
  .voc-job-actions .voc-job-main-action .voc-button-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}

/* LAY-03: a wide card shows the chosen job beside the list; the pane stays in view while the list
   scrolls. */
.voc-queue--split { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); align-items: start; gap: 16px; }
.voc-queue-list { display: grid; gap: 12px; min-width: 0; container: voc-list / inline-size; }
.voc-job[data-selected="true"] { border-color: var(--voc-accent-border); box-shadow: inset 3px 0 0 var(--voc-accent-ink); }
.voc-detail-pane { position: sticky; top: 0; display: grid; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--voc-hairline); border-radius: 16px; background: var(--ha-card-background, var(--card-background-color, transparent)); }
.voc-pane-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.voc-pane-title { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.voc-pane-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--voc-hairline); }
.voc-pane-actions .voc-action-start { margin-right: auto; }
`;
