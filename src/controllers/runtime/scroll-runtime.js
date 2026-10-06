// The card's scroll regions (`[data-scroll]`): the body inside a frame and an overlay's content.
// After every render and on scroll, resize and late loads the runtime marks the edges with
// content beyond them (`data-overflow-top`/`-bottom`, faded like the tab strip) and the width a
// classic scrollbar takes (`--voc-scrollbar`), so the content stays aligned with the header. It
// restores a region's position when the user comes back to it. See internal dev doc §9 "Rahmen
// und Höhe".

const EDGE_PX = 1;

export function scrollEdges({ scrollTop, clientHeight, scrollHeight }) {
  return { top: scrollTop > EDGE_PX, bottom: scrollTop + clientHeight < scrollHeight - EDGE_PX };
}

// 0 for overlay scrollbars and for a region without overflow.
export function scrollbarWidth({ offsetWidth, clientWidth }) {
  return Math.max(0, Math.round(offsetWidth - clientWidth));
}

// The region on screen: an overlay's content, else the body.
function activeRegion(root) {
  return root.querySelector(".voc-overlay-scroll[data-scroll]") || root.querySelector(".voc-body[data-scroll]");
}

export function createScrollRuntime({ root, platform }) {
  // Positions of the regions still on the stack, by key.
  const saved = new Map();
  let shownKey = null;
  let stopObserving = null;

  function mark(region) {
    const { top, bottom } = scrollEdges(region);
    region.toggleAttribute("data-overflow-top", top);
    region.toggleAttribute("data-overflow-bottom", bottom);
    const width = scrollbarWidth(region);
    if (width) region.style.setProperty("--voc-scrollbar", `${width}px`);
    else region.style.removeProperty("--voc-scrollbar");
  }

  function markAll() {
    for (const region of root.querySelectorAll("[data-scroll]")) mark(region);
  }

  function onScroll(event) {
    if (event.target?.hasAttribute?.("data-scroll")) mark(event.target);
  }

  const fonts = () => root.host?.ownerDocument?.fonts ?? null;

  return {
    connect() {
      root.addEventListener("scroll", onScroll, { capture: true, passive: true });
      root.addEventListener("load", markAll, { capture: true });
      fonts()?.addEventListener?.("loadingdone", markAll);
      stopObserving = platform.observeResize(root.host, markAll);
    },
    disconnect() {
      root.removeEventListener("scroll", onScroll, { capture: true });
      root.removeEventListener("load", markAll, { capture: true });
      fonts()?.removeEventListener?.("loadingdone", markAll);
      stopObserving?.();
      stopObserving = null;
    },
    // Before a render: the position of the region on screen.
    capture() {
      const region = activeRegion(root);
      if (shownKey !== null && region) saved.set(shownKey, region.scrollTop);
    },
    // After a render. `stack`: keys of the view and of each open overlay, the last on screen. A
    // region shown again stands where it was left; a new one starts at the top.
    sync(stack = []) {
      const key = stack[stack.length - 1] ?? null;
      for (const known of [...saved.keys()]) if (!stack.includes(known)) saved.delete(known);
      const region = activeRegion(root);
      if (region && key !== shownKey) region.scrollTop = saved.get(key) ?? 0;
      shownKey = key;
      markAll();
    },
  };
}
