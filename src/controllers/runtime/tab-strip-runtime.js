// Keeps every view reachable when the tab row does not fit. Step by step the primary action, the
// inactive tabs and then all tabs drop their visible labels (`data-compact` "action", "labels",
// "icons" on the row; names stay for assistive technology); if it still does not fit the strip
// scrolls (Material's scrollable tabs): an edge fades where more tabs lie beyond it, and the active
// tab is brought into view when it changes or the card resizes. The page itself never scrolls.
// See internal dev doc §9 "Reiterleiste".

const EDGE_PX = 1;
const REVEAL_PAD_PX = 28;
const COMPACT_LEVELS = Object.freeze(["action", "labels", "icons"]);

export function stripOverflow({ scrollLeft, clientWidth, scrollWidth }) {
  return { start: scrollLeft > EDGE_PX, end: scrollLeft + clientWidth < scrollWidth - EDGE_PX };
}

// The scroll offset that shows the span [left, right] clear of the edge fade; the current offset
// when it already does.
export function revealOffset({ left, right, scrollLeft, clientWidth, scrollWidth }, pad = REVEAL_PAD_PX) {
  const max = Math.max(0, scrollWidth - clientWidth);
  if (left - pad < scrollLeft) return Math.max(0, left - pad);
  if (right + pad > scrollLeft + clientWidth) return Math.min(max, right + pad - clientWidth);
  return scrollLeft;
}

export function createTabStripRuntime({ root, platform }) {
  let stopObserving = null;
  let shownView = null;

  const measure = (strip) => ({ scrollLeft: strip.scrollLeft, clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth });

  function mark(strip) {
    const { start, end } = stripOverflow(measure(strip));
    strip.toggleAttribute("data-overflow-start", start);
    strip.toggleAttribute("data-overflow-end", end);
  }

  function reveal(strip) {
    const tab = strip.querySelector('[role="tab"][aria-selected="true"]');
    if (!tab) return;
    const stripBox = strip.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const left = tabBox.left - stripBox.left + strip.scrollLeft;
    strip.scrollLeft = revealOffset({ left, right: left + tabBox.width, scrollLeft: strip.scrollLeft, clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth });
  }

  // Measured from the labelled layout every time, so the result depends only on the width.
  function compact(strip) {
    const row = strip.closest(".voc-tab-row") || strip;
    row.removeAttribute("data-compact");
    for (const level of COMPACT_LEVELS) {
      if (!stripOverflow({ ...measure(strip), scrollLeft: 0 }).end) return;
      row.setAttribute("data-compact", level);
    }
  }

  function sync({ force = false } = {}) {
    const strip = root.querySelector(".voc-tabs");
    if (!strip) {
      shownView = null;
      return;
    }
    compact(strip);
    const active = strip.querySelector('[role="tab"][aria-selected="true"]')?.dataset.view ?? null;
    if (force || active !== shownView) reveal(strip);
    shownView = active;
    mark(strip);
  }

  function onScroll(event) {
    if (event.target?.classList?.contains("voc-tabs")) mark(event.target);
  }

  return {
    connect() {
      root.addEventListener("scroll", onScroll, { capture: true, passive: true });
      stopObserving = platform.observeResize(root.host, () => sync({ force: true }));
    },
    disconnect() {
      root.removeEventListener("scroll", onScroll, { capture: true });
      stopObserving?.();
      stopObserving = null;
      shownView = null;
    },
    // After every render: the edges, and the active tab when it changed.
    sync,
  };
}
