// The width tier that changes a view's structure, not only its styles: from `WIDE_MIN_WIDTH` of
// inner card width the queue shows list and detail side by side (LAY-03). Container queries cover
// every other tier. The runtime measures after every render and on resize and reports a change.
// See internal dev doc §9 "Rahmen und Höhe".

export const WIDE_MIN_WIDTH = 840;

export function createLayoutRuntime({ root, platform, onWide }) {
  let stopObserving = null;
  let wide = null;

  function measure() {
    const card = root.querySelector("ha-card");
    if (!card) return;
    const next = card.clientWidth >= WIDE_MIN_WIDTH;
    if (next === wide) return;
    wide = next;
    onWide(next);
  }

  return {
    connect() {
      stopObserving = platform.observeResize(root.host, measure);
    },
    disconnect() {
      stopObserving?.();
      stopObserving = null;
      wide = null;
    },
    sync: measure,
  };
}
