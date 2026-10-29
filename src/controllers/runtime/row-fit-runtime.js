// A job row keeps its main action and menu beside the title, centred on the row, while the title
// line fits on one line beside them; otherwise the title runs across the row above the details and
// actions (`data-title` "fits" or "wraps" on `.voc-job`, UI-32, LAY-09). See internal dev doc §8
// "Queue".

const ROW = ".voc-job";
const FIT_TOLERANCE_PX = 0.5;

// Whether a title of `lines` lines whose line ends at `end` stays clear of actions that leave the
// title column up to `limit`.
export function titleFits({ lines, end, limit }) {
  return lines === 1 && end <= limit + FIT_TOLERANCE_PX;
}

export function createRowFitRuntime({ root, platform }) {
  let stopObserving = null;
  // Per row (`data-key`): what its fit depends on and the fit measured for it.
  let fitted = new Map();

  const partsOf = (row) => {
    const actions = [...row.children].find((node) => node.classList.contains("voc-job-actions"));
    const line = row.querySelector(".voc-job-title-line");
    const title = line?.querySelector(".voc-job-title");
    return actions && title ? { actions, line, title } : null;
  };

  // The row's width, its title line and its actions; equal in both forms of the row.
  const rowKey = (row, { actions, line }) => `${row.clientWidth}|${line.textContent}|${actions.textContent}|${actions.childElementCount}`;

  // Read in the row's current form: the actions' column starts at the same place in both forms,
  // and a title on one line is as wide as its text in both. Null without a layout engine (jsdom).
  function measure(row, { actions, line, title }) {
    const range = row.ownerDocument.createRange();
    if (typeof range.getClientRects !== "function") return null;
    range.selectNodeContents(title);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    const last = line.lastElementChild === title ? range : line.lastElementChild;
    const gap = Number.parseFloat(row.ownerDocument.defaultView.getComputedStyle(row).columnGap) || 0;
    return { lines, end: last.getBoundingClientRect().right, limit: actions.getBoundingClientRect().left - gap };
  }

  // True, false, or null where nothing could be measured.
  const fitOf = (measured) => (measured ? titleFits(measured) : null);

  // Every row is read before any is written, so a render lays the rows out at most once.
  function sync({ force = false } = {}) {
    const next = new Map();
    const decisions = [...root.querySelectorAll(ROW)].map((row) => {
      const parts = partsOf(row);
      if (!parts) return [row, null];
      const key = rowKey(row, parts);
      const known = fitted.get(row.dataset.key);
      const fits = !force && known?.key === key ? known.fits : fitOf(measure(row, parts));
      next.set(row.dataset.key, { key, fits });
      return [row, fits === null ? null : fits ? "fits" : "wraps"];
    });
    fitted = next;
    for (const [row, value] of decisions) {
      if (row.getAttribute("data-title") === value) continue;
      if (value) row.setAttribute("data-title", value);
      else row.removeAttribute("data-title");
    }
  }

  // A web font that finishes loading changes the title widths but not the card's size.
  const fonts = () => root.host?.ownerDocument?.fonts ?? null;
  const onFontsLoaded = () => sync({ force: true });

  return {
    connect() {
      fonts()?.addEventListener?.("loadingdone", onFontsLoaded);
      stopObserving = platform.observeResize(root.host, () => sync());
    },
    disconnect() {
      fonts()?.removeEventListener?.("loadingdone", onFontsLoaded);
      stopObserving?.();
      stopObserving = null;
      fitted = new Map();
    },
    // After every render, before scroll positions are restored, since a row's form sets its height.
    sync,
  };
}
