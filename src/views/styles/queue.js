// Queue view: job rows (status, progress, managing icons and the main action), attention and
// recovery alerts, template quick starts and pagination. The job row is shared with the history
// view. Below 560 px of card, or of the list beside a wide queue's detail, the managing icons give
// way to the row's menu beside its main action (LAY-09). The details line has one line height, chips included, so rows of the same kind are
// equally tall (LAY-21).

const NARROW_ROW = [
  ".voc-job .voc-job-manage, .voc-job .voc-job-actions-gap { display: none; }",
  ".voc-job .voc-menu-anchor { display: inline-flex; }",
].join("\n  ");

export const QUEUE_CSS = `
.voc-view { display: grid; gap: 12px; min-width: 0; }

.voc-job {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 6px;
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

.voc-job-lead { display: flex; justify-content: center; color: var(--voc-faint); }
.voc-job-lead ha-icon { --mdc-icon-size: 18px; }
.voc-job-position { font-size: 13px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--voc-faint); }

.voc-job-main {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.voc-job-title-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.voc-job-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 850; line-height: 1.2; }
.voc-job-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; font-size: 11.5px; font-weight: 700; line-height: 16px; color: var(--voc-muted); }
.voc-job-meta .voc-chip { padding: 0 6px; line-height: 14px; }
.voc-job-mode { display: inline-flex; align-items: center; gap: 3px; }
.voc-job-mode ha-icon { --mdc-icon-size: 14px; }
.voc-job-rooms { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-job-status, .voc-job-outcome { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11.5px; font-weight: 750; line-height: 1.25; }
.voc-job-status span, .voc-job-outcome span { min-width: 0; overflow-wrap: anywhere; }
.voc-job-status ha-icon, .voc-job-outcome ha-icon { --mdc-icon-size: 14px; }
.voc-job-status[data-tone="ready"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
.voc-job-status[data-tone="delay"] { color: color-mix(in srgb, var(--voc-info) 82%, var(--primary-text-color)); }
.voc-job-status[data-tone="blocked"] { color: var(--voc-warning-ink); }
.voc-job-status[data-tone="waiting"], .voc-job-status[data-tone="edit"] { color: var(--voc-muted); }
.voc-job-status[data-tone="muted"] { color: var(--voc-faint); }
.voc-job-status[data-tone="attention"], .voc-job-outcome { color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-job-progress { display: grid; gap: 3px; min-width: 0; font-size: 11.5px; font-weight: 700; line-height: 16px; color: var(--voc-muted); }
.voc-job-progress-line { min-width: 0; overflow-wrap: anywhere; }
.voc-job-percents { display: flex; flex-wrap: wrap; gap: 2px 12px; }
.voc-job-percent { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.voc-progress { position: relative; display: block; width: 72px; height: 4px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, var(--voc-info) 18%, transparent); }
.voc-progress > span { display: block; height: 100%; border-radius: 2px; background: var(--voc-info); }
.voc-job-actions .voc-job-main-action { min-height: var(--voc-row-target); padding-inline: 10px; }
.voc-job[data-actions="none"] { grid-template-columns: 30px minmax(0, 1fr); }
.voc-job-actions { display: flex; align-items: center; gap: var(--voc-target-gap); }
.voc-job-actions .voc-button--icon { width: var(--voc-row-target); min-width: var(--voc-row-target); min-height: var(--voc-row-target); }
.voc-job-actions-gap { flex: none; width: 1px; height: 18px; margin: 0 4px; background: var(--voc-hairline); }
.voc-job-manage { display: contents; }
.voc-job .voc-menu-anchor { display: none; }
.voc-job .voc-menu-button { width: var(--voc-row-target); min-width: var(--voc-row-target); min-height: var(--voc-row-target); }

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

.voc-quick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.voc-quick-label { font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); margin-right: 2px; }

.voc-pagination { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 750; color: var(--voc-muted); }

@container voc-card (max-width: 559px) {
  .voc-job { grid-template-columns: 22px minmax(0, 1fr) auto; }
  ${NARROW_ROW}
}

@supports not (container-type: inline-size) {
  @media (max-width: 699px) {
  ${NARROW_ROW}
  }
}

/* LAY-03: a wide card shows the chosen job beside the list; the pane stays in view while the list
   scrolls. */
.voc-queue--split { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); align-items: start; gap: 16px; }
.voc-queue-list { display: grid; gap: 12px; min-width: 0; container: voc-list / inline-size; }
/* Beside the detail the list is as narrow as a narrow card: rows keep their main action and menu. */
@container voc-list (max-width: 559px) {
  ${NARROW_ROW}
}
.voc-job[data-selected="true"] { border-color: var(--voc-accent-border); box-shadow: inset 3px 0 0 var(--voc-accent-ink); }
.voc-detail-pane { position: sticky; top: 0; display: grid; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--voc-hairline); border-radius: 16px; background: var(--ha-card-background, var(--card-background-color, transparent)); }
.voc-pane-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.voc-pane-title { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.voc-pane-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--voc-hairline); }
.voc-pane-actions .voc-action-start { margin-right: auto; }
`;
