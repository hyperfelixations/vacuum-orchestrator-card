// Layout stages, mobile first. Each stage is written once and reused by the media-query
// fallback below, so the two paths cannot drift apart.
const MEDIUM_STAGE = `.voc-job-row{grid-template-columns:34px minmax(0,1fr) auto;gap:10px;padding:12px}.voc-job-position{font-size:12px}.voc-job-subtitle,.voc-job-meta,.voc-job-detail-line{font-size:12px}.voc-job-actions{grid-column:3;grid-row:1/3;align-self:center;grid-auto-flow:row;grid-template-columns:repeat(3,32px);grid-auto-columns:auto;justify-content:end;gap:6px}.voc-job-action{min-width:32px;width:32px;height:32px}.voc-job-pending{grid-column:2/4}`;

const WIDE_STAGE = `.voc-job-row{grid-template-columns:38px minmax(150px,1.4fr) auto minmax(210px,1.3fr) auto}.voc-job-main{display:contents}.voc-job-identity,.voc-job-meta,.voc-job-detail-line{align-self:center}.voc-job-identity{grid-column:2}.voc-job-meta{grid-column:3;flex-wrap:nowrap}.voc-job-detail-line{grid-column:4;flex-wrap:wrap}.voc-job-actions{grid-column:5;grid-row:auto;display:flex;flex-wrap:nowrap;justify-content:flex-end}.voc-job-pending{grid-column:2/-1}`;

export const QUEUE_CSS = `
.voc-queue-section,.voc-history-section,.voc-rooms-section,.voc-robots-section,.voc-diagnostics-section{display:grid;gap:12px;min-width:0;color:var(--primary-text-color)}
.voc-section-title,.voc-active-jobs h3,.voc-pending-queue h3{margin:0;color:var(--primary-text-color);font-size:14px;font-weight:850;letter-spacing:.01em}
.voc-job-row{position:relative;display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;align-items:center;padding:10px;border:1px solid var(--voc-hairline);border-radius:14px;background:var(--voc-panel);min-width:0;cursor:pointer;transition:background-color .16s ease,border-color .16s ease}
.voc-job-row:hover{background:color-mix(in srgb,var(--voc-panel) 86%,var(--primary-color))}
.voc-job-row:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
.voc-job-position{align-self:start;color:var(--secondary-text-color);font-variant-numeric:tabular-nums;font-size:11px;font-weight:850;text-align:center;padding-top:3px}
.voc-job-main{grid-column:2;min-width:0;display:grid;gap:5px}
.voc-job-identity{min-width:0;display:grid;gap:2px}
.voc-job-heading,.voc-job-subtitle,.voc-job-meta,.voc-job-detail-line{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.voc-job-subtitle{color:var(--secondary-text-color);font-size:11px}
.voc-job-mode-words{overflow-wrap:anywhere}
.voc-job-heading{font-size:14px;font-weight:780}
/* The job name opens the detail page but reads as the row's title, not as a form control. */
.voc-job-name{min-width:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:start;cursor:pointer;overflow-wrap:anywhere}
.voc-job-name:hover{text-decoration:underline}
.voc-job-name:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;border-radius:6px}
.voc-job-state,.voc-job-readiness,.voc-job-mode,.voc-room-due,.voc-robot-availability,.voc-diagnostic-connection{display:inline-flex;align-items:center;width:max-content;max-width:100%;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:850;line-height:1.1;white-space:nowrap}
.voc-job-state,.voc-job-readiness{background:color-mix(in srgb,var(--secondary-background-color) 76%,var(--primary-color));color:var(--primary-text-color)}
/* An explicit display would otherwise defeat the hidden attribute. */
.voc-job-state[hidden],.voc-job-readiness[hidden],.voc-job-mode[hidden]{display:none}
.voc-job-meta,.voc-job-detail-line{color:var(--secondary-text-color);font-size:11px}
.voc-job-areas,.voc-job-source,.voc-job-time{min-width:0;overflow-wrap:anywhere}
.voc-job-mode{background:var(--voc-tone-soft, color-mix(in srgb,var(--primary-color) 12%,transparent));color:var(--primary-text-color)}
.voc-job-settings{display:inline-flex;gap:4px;flex-wrap:wrap;align-items:center}
.voc-job-setting{font-variant-numeric:tabular-nums}
.voc-setting-separator{color:var(--secondary-text-color)}
.voc-job-actions{grid-column:1/-1;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,88px);justify-content:end;gap:6px;align-items:center}
/* A row action is an icon button at every width; its name is carried by aria-label. */
.voc-job-action{min-width:0;height:44px;padding:6px}
.voc-job-action .voc-action-label{display:none}
.voc-job-pending{grid-column:1/-1;color:var(--primary-color);font-size:11px;font-weight:750}
.voc-tone-running{background:color-mix(in srgb,var(--info-color,var(--primary-color)) 18%,transparent)}
.voc-tone-attention,.voc-readiness-blocked{background:color-mix(in srgb,var(--error-color) 18%,transparent)}
.voc-tone-ready,.voc-readiness-ready{background:color-mix(in srgb,var(--success-color) 18%,transparent)}
.voc-tone-paused{background:color-mix(in srgb,var(--warning-color) 20%,transparent)}
.voc-active-jobs,.voc-pending-queue{display:grid;gap:8px;min-width:0}
.voc-pagination{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px}
.voc-page-status{color:var(--secondary-text-color);font-size:12px;font-variant-numeric:tabular-nums}
.voc-section-loading{color:var(--secondary-text-color);font-size:12px}

@container voc-card (min-width:560px){${MEDIUM_STAGE}}
@container voc-card (min-width:840px){${WIDE_STAGE}}
@supports not (container-type:inline-size){@media (min-width:700px){${MEDIUM_STAGE}}@media (min-width:980px){${WIDE_STAGE}}}
`;
