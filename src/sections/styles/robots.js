export const ROBOTS_CSS = `
.voc-robot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;min-width:0}
.voc-robot-card{display:grid;gap:10px;align-content:start;padding:14px;border:1px solid var(--voc-hairline);border-radius:14px;background:var(--voc-panel);min-width:0;overflow:hidden}
.voc-robot-header{display:flex;align-items:center;gap:10px;min-width:0}.voc-robot-header h3{margin:0 0 4px;font-size:15px;font-weight:850;overflow-wrap:anywhere}.voc-robot-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:color-mix(in srgb,var(--primary-color) 12%,transparent);color:var(--primary-color);flex:none}
.voc-robot-status,.voc-robot-active{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--secondary-text-color);font-size:12px;min-width:0}.voc-robot-status>span:first-child,.voc-robot-active>span:first-child{display:inline-flex;align-items:center;gap:5px}
.voc-robot-status ha-icon,.voc-robot-active ha-icon{width:14px;height:14px}
.voc-robot-status strong,.voc-robot-active span:last-child{color:var(--primary-text-color);font-weight:800;overflow-wrap:anywhere;text-align:end}
.voc-robot-blocked{padding:8px;border-radius:10px;background:color-mix(in srgb,var(--error-color) 14%,transparent);color:var(--primary-text-color);font-size:12px;overflow-wrap:anywhere}
.voc-robot-capabilities{display:grid;gap:8px;min-width:0}
.voc-robot-chip-group{display:grid;gap:5px;min-width:0}
.voc-robot-chip-label{color:var(--secondary-text-color);font-size:11px;font-weight:800}
.voc-robot-chip-list{display:flex;gap:6px;flex-wrap:wrap}.voc-robot-chip{padding:4px 7px;border-radius:999px;background:color-mix(in srgb,var(--primary-color) 11%,transparent);font-size:11px;overflow-wrap:anywhere}.voc-robot-max-passes{font-size:11px;color:var(--secondary-text-color)}
.voc-robot-map{display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:10px}
`;
