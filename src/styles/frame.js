// The frame: a card with a fixed height (`data-frame` on `ha-card`: "fill" takes the dashboard's
// height, "lock" keeps `--voc-frame-height` while an overlay is open). Header, notices, panel and
// tab row keep their place and the body scrolls; an overlay keeps its heading and actions and
// scrolls its content between them; while content continues below, a hairline separates it from
// the actions without moving them. Regions reach the card's edges, so their scrollbar sits at
// the edge and focus rings are not cut. See internal dev doc §9 "Rahmen und Höhe".

export const FRAME_CSS = `
:host([data-voc-frame]) { height: 100%; }

ha-card[data-frame] { display: flex; flex-direction: column; box-sizing: border-box; height: 100%; }
ha-card[data-frame="lock"] { height: var(--voc-frame-height); }
ha-card[data-frame] > .voc-root { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
ha-card[data-frame] > .voc-root > * { flex: none; }

ha-card[data-frame] .voc-body,
ha-card[data-frame] .voc-overlay-scroll {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-padding-block: 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--voc-hairline) transparent;
}

ha-card[data-frame] > .voc-root > .voc-body {
  flex: 1 1 auto;
  margin: -4px calc(-1 * var(--voc-pad-x)) calc(-1 * var(--voc-pad-bottom));
  padding: 4px max(0px, calc(var(--voc-pad-x) - var(--voc-scrollbar, 0px))) var(--voc-pad-bottom) var(--voc-pad-x);
}

ha-card[data-frame] .voc-body[data-body^="onboarding:"] { display: flex; flex-direction: column; }
ha-card[data-frame] .voc-body[data-body^="onboarding:"] > .voc-onboarding { flex: none; margin-block: auto; }

ha-card[data-frame] .voc-body[data-body^="overlay:"] { overflow-y: hidden; display: flex; flex-direction: column; }
ha-card[data-frame] .voc-body[data-body^="overlay:"] > .voc-overlay { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
ha-card[data-frame] .voc-overlay > * { flex: none; }
ha-card[data-frame] .voc-overlay > .voc-overlay-scroll {
  flex: 1 1 auto;
  align-content: start;
  margin: -4px calc(-1 * var(--voc-pad-x));
  padding: 4px max(0px, calc(var(--voc-pad-x) - var(--voc-scrollbar, 0px))) 4px var(--voc-pad-x);
}

ha-card[data-frame] .voc-overlay-scroll[data-overflow-bottom] + .voc-overlay-actions { margin-top: -6px; padding-top: 9px; border-top: 1px solid var(--divider-color, var(--voc-hairline)); }

ha-card[data-frame] [data-scroll][data-overflow-top] { mask-image: linear-gradient(to bottom, transparent, #000 16px); }
ha-card[data-frame] [data-scroll][data-overflow-bottom] { mask-image: linear-gradient(to top, transparent, #000 16px); }
ha-card[data-frame] [data-scroll][data-overflow-top][data-overflow-bottom] { mask-image: linear-gradient(to bottom, transparent, #000 16px, #000 calc(100% - 16px), transparent); }
`;
