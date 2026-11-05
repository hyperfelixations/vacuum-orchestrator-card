// Keeps every view reachable when the tab row does not fit. Step by step the inactive tabs and
// then the primary action drop their visible labels (`data-compact` "labels", "action" on the row;
// names stay for assistive technology). The active tab keeps its label, the only place the card
// names the view on screen. The action's slot holds the widest primary action of the shown views
// (card shell), so every view gives way at the same width. If the row still does not fit the strip
// scrolls (Material's scrollable tabs): an edge fades where more tabs lie beyond it, and the active
// tab is brought into view when it changes or the card resizes. The page itself never scrolls. See
// internal dev doc §9 "Reiterleiste".

const EDGE_PX = 1;
const REVEAL_PAD_PX = 28;
const COMPACT_LEVELS = Object.freeze(["labels", "action"]);
// Fits remembered for this many rows (tabs, labels, active tab, action) at the card's width.
export const FIT_MEMORY = 32;

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
  // The last fit: the row it was measured for and its compaction level.
  let compacted = null;
  // Earlier fits at this width by row, oldest first: a tab chosen again is not measured.
  const fits = new Map();

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

  // What the row's fit depends on besides its width, which only a resize changes: its tabs and
  // their labels, and the action. Read from the markup, never from the layout.
  const rowKey = (strip, row) =>
    [...strip.querySelectorAll('[role="tab"]'), row.querySelector(".voc-primary-action")]
      .map((node) => (node ? `${node.dataset.view ?? ""}:${node.getAttribute("aria-selected") ?? ""}:${node.textContent.trim()}` : ""))
      .join("|");

  // Measured from the labelled layout, so the result depends only on the width; measured again
  // only for a row not seen at this width, since measuring after a render lays out the whole page
  // (UI-31). A fit is the level and whether the strip still scrolls at it. Returns "measured",
  // "remembered" or "same" (the row and strip as they were).
  function compact(strip, force) {
    const row = strip.closest(".voc-tab-row") || strip;
    const key = rowKey(strip, row);
    if (force) fits.clear();
    const known = fits.get(key);
    if (known) {
      fits.delete(key);
      fits.set(key, known);
      const same = compacted?.key === key && compacted.strip === strip;
      compacted = { key, strip, ...known };
      if (row.getAttribute("data-compact") !== known.level) {
        if (known.level) row.setAttribute("data-compact", known.level);
        else row.removeAttribute("data-compact");
      }
      return same ? "same" : "remembered";
    }
    row.removeAttribute("data-compact");
    let level = null;
    let scrolls = stripOverflow({ ...measure(strip), scrollLeft: 0 }).end;
    for (const next of COMPACT_LEVELS) {
      if (!scrolls) break;
      row.setAttribute("data-compact", next);
      level = next;
      scrolls = stripOverflow({ ...measure(strip), scrollLeft: 0 }).end;
    }
    const fit = { level, scrolls };
    compacted = { key, strip, ...fit };
    fits.set(key, fit);
    if (fits.size > FIT_MEMORY) fits.delete(fits.keys().next().value);
    return "measured";
  }

  function sync({ force = false } = {}) {
    const strip = root.querySelector(".voc-tabs");
    if (!strip) {
      shownView = null;
      compacted = null;
      return;
    }
    const fit = compact(strip, force);
    const active = strip.querySelector('[role="tab"][aria-selected="true"]')?.dataset.view ?? null;
    // An unchanged row keeps its scroll position and edges; scrolling marks them itself.
    if (fit === "same" && active === shownView) return;
    const changed = force || fit !== "same" || active !== shownView;
    shownView = active;
    // A strip that does not scroll has no edge to fade and no tab to bring into view.
    if (!compacted.scrolls) {
      strip.removeAttribute("data-overflow-start");
      strip.removeAttribute("data-overflow-end");
      return;
    }
    if (changed) reveal(strip);
    mark(strip);
  }

  function onScroll(event) {
    if (event.target?.classList?.contains("voc-tabs")) mark(event.target);
  }

  // A web font that finishes loading changes the label widths but not the host's size.
  const fonts = () => root.host?.ownerDocument?.fonts ?? null;
  const onFontsLoaded = () => sync({ force: true });

  return {
    connect() {
      root.addEventListener("scroll", onScroll, { capture: true, passive: true });
      fonts()?.addEventListener?.("loadingdone", onFontsLoaded);
      stopObserving = platform.observeResize(root.host, () => sync({ force: true }));
    },
    disconnect() {
      root.removeEventListener("scroll", onScroll, { capture: true });
      fonts()?.removeEventListener?.("loadingdone", onFontsLoaded);
      stopObserving?.();
      stopObserving = null;
      shownView = null;
      compacted = null;
      fits.clear();
    },
    // After every render: the edges, and the active tab when it changed.
    sync,
  };
}
