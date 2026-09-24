// The release switch sits beside the room only once the row is wide enough for two columns.
const WIDE_STAGE = `.voc-room-row{grid-template-columns:40px minmax(0,1fr) auto}.voc-room-icon{width:38px;height:38px}.voc-room-release{grid-column:auto;justify-self:end}`;

export const ROOMS_CSS = `
.voc-rooms-section{grid-template-columns:minmax(0,1fr)}
.voc-room-row{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:start;padding:12px;border:1px solid var(--voc-hairline);border-radius:14px;background:var(--voc-panel);min-width:0}
.voc-room-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:13px;background:color-mix(in srgb,var(--primary-color) 12%,transparent);color:var(--primary-color)}
.voc-room-main{display:grid;gap:7px;min-width:0}
.voc-room-heading,.voc-room-times{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}
.voc-room-heading h3{margin:0;font-size:14px;font-weight:820;overflow-wrap:anywhere}
.voc-room-times{color:var(--secondary-text-color);font-size:11px;column-gap:14px}
.voc-room-time{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow-wrap:anywhere}
.voc-room-time-label{font-weight:800}
.voc-room-time ha-icon{width:14px;height:14px}
.voc-room-progress,.voc-detail-progress{height:7px;border-radius:999px;background:color-mix(in srgb,var(--secondary-background-color) 70%,var(--primary-color));overflow:hidden}
.voc-room-progress span,.voc-detail-progress span{display:block;width:calc(var(--voc-progress,0) * 100%);height:100%;border-radius:inherit;background:var(--primary-color);transition:width .16s ease}
.voc-room-progress[data-overdue="true"] span{background:var(--error-color)}
.voc-room-remaining{font-size:12px;font-weight:750;color:var(--primary-text-color)}
.voc-room-release{grid-column:2;justify-self:start;display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:11px;max-width:180px;overflow-wrap:anywhere}
.voc-room-blockers{grid-column:2/-1;margin:0;padding-inline-start:18px;color:var(--error-color);font-size:11px}

@container voc-card (min-width:560px){${WIDE_STAGE}}
@supports not (container-type:inline-size){@media (min-width:700px){${WIDE_STAGE}}}
`;
