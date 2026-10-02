// Queue view: job rows, recovery alerts, template quick starts and pagination. The job row is
// shared with the history view. Below 560 px a row with several actions spreads them as equal
// tiles over its full width; a single action stays beside the title.

const JOB_ACTION_BAR = [
  '.voc-job[data-actions="several"] .voc-job-actions { grid-column: 1 / -1; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; padding-top: 2px; }',
  '.voc-job[data-actions="several"] .voc-job-actions .voc-button--icon { width: auto; min-width: 0; min-height: var(--voc-tile-target); border-radius: 12px; border-color: var(--voc-hairline); background: var(--voc-chip-bg); }',
  '.voc-job[data-actions="several"] .voc-job-actions .voc-button--icon:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }',
  '.voc-job[data-actions="several"] .voc-job-actions-gap { display: none; }',
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
  background: linear-gradient(90deg, transparent, var(--tone-color), transparent);
  background-size: 200% 100%;
  animation: voc-progress 1.2s linear infinite;
}
@keyframes voc-progress { from { background-position: 100% 0; } to { background-position: -100% 0; } }

.voc-job-lead { display: flex; justify-content: center; color: var(--voc-faint); }
.voc-job-lead ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
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
.voc-job-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; font-size: 11.5px; font-weight: 700; color: var(--voc-muted); }
.voc-job-mode { display: inline-flex; align-items: center; gap: 3px; }
.voc-job-mode ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; }
.voc-job-rooms { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voc-job-readiness, .voc-job-outcome { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11.5px; font-weight: 750; line-height: 1.25; }
.voc-job-readiness span:first-of-type, .voc-job-outcome span { min-width: 0; overflow-wrap: anywhere; }
.voc-job-readiness ha-icon, .voc-job-outcome ha-icon { --mdc-icon-size: 14px; width: 14px; height: 14px; flex: none; }
.voc-job-readiness[data-readiness="ready"] { color: color-mix(in srgb, var(--voc-success) 80%, var(--primary-text-color)); }
.voc-job-readiness[data-readiness="blocked"] { color: var(--voc-warning-ink); }
.voc-job-readiness[data-readiness="unknown"] { color: var(--voc-muted); }
.voc-job-outcome { color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-job-more { flex: none; padding: 0 5px; border-radius: 999px; background: var(--voc-chip-bg); font-size: 10.5px; }
.voc-job[data-actions="none"] { grid-template-columns: 30px minmax(0, 1fr); }
.voc-job-actions { display: flex; align-items: center; gap: var(--voc-target-gap); }
.voc-job-actions .voc-button--icon { width: var(--voc-row-target); min-width: var(--voc-row-target); min-height: var(--voc-row-target); }
.voc-job-actions-gap { flex: none; width: 1px; height: 18px; margin: 0 4px; background: var(--voc-hairline); }

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
.voc-alert > ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; flex: none; color: color-mix(in srgb, var(--voc-error) 80%, var(--primary-text-color)); }
.voc-alert-text { display: grid; gap: 2px; flex: 1; min-width: 0; font-size: 12px; font-weight: 650; line-height: 1.3; color: var(--voc-muted); }
.voc-alert-text strong { color: var(--primary-text-color); font-size: 13px; font-weight: 850; }

.voc-quick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.voc-quick-label { font-size: 10px; font-weight: 850; letter-spacing: .075em; text-transform: uppercase; color: var(--voc-faint); margin-right: 2px; }

.voc-pagination { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 750; color: var(--voc-muted); }

@container voc-card (max-width: 559px) {
  .voc-job { grid-template-columns: 22px minmax(0, 1fr) auto; }
  .voc-job[data-actions="none"], .voc-job[data-actions="several"] { grid-template-columns: 22px minmax(0, 1fr); }
  .voc-job[data-actions="one"] .voc-job-actions .voc-button--icon { width: var(--voc-tile-target); min-width: var(--voc-tile-target); min-height: var(--voc-tile-target); }
  ${JOB_ACTION_BAR}
}

@supports not (container-type: inline-size) {
  @media (max-width: 699px) {
    .voc-job[data-actions="several"] { grid-template-columns: 22px minmax(0, 1fr); }
  ${JOB_ACTION_BAR}
  }
}
`;
