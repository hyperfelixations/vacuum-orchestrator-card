// The browser behind the card: clock, timers, page visibility, size changes, console and Home
// Assistant's in-app navigation. Everything else reaches the browser through the DOM it renders.

export const AFTER_PAINT_LIMIT_MS = 100;
export const IDLE_FALLBACK_MS = 2000;

function documentOf(getDocument) {
  return () => getDocument?.() || null;
}

// `getHost()`: the card element, from which Home Assistant's own events are fired.
export function createBrowserPlatform(getDocument, getHost = () => null) {
  const currentDocument = documentOf(getDocument);
  const viewOf = () => currentDocument()?.defaultView || null;
  return {
    now: () => Date.now(),
    // Never jumps with the wall clock: carries the integration's time forward between answers.
    monotonicNow: () => viewOf()?.performance?.now?.() ?? Date.now(),
    setTimeout(fn, ms) {
      const view = viewOf();
      if (!view?.setTimeout) return null;
      const id = view.setTimeout(fn, Math.max(0, Number(ms) || 0));
      return { cancel: () => view.clearTimeout(id) };
    },
    clearTimeout(handle) { handle?.cancel?.(); },
    // Calls `fn` once the browser has painted: in the task after the next frame, or after
    // `AFTER_PAINT_LIMIT_MS` where frames rest (a hidden page). Returns a handle to cancel it.
    afterPaint(fn) {
      const view = viewOf();
      if (!view?.setTimeout) return null;
      let done = false;
      const ids = [];
      const run = () => {
        if (done) return;
        done = true;
        cancel();
        fn();
      };
      function cancel() {
        for (const [clear, id] of ids.splice(0)) clear(id);
      }
      if (view.requestAnimationFrame) ids.push([view.cancelAnimationFrame.bind(view), view.requestAnimationFrame(() => ids.push([view.clearTimeout.bind(view), view.setTimeout(run, 0)]))]);
      ids.push([view.clearTimeout.bind(view), view.setTimeout(run, AFTER_PAINT_LIMIT_MS)]);
      return {
        cancel() {
          done = true;
          cancel();
        },
      };
    },
    // Calls `fn` once the browser is idle (`requestIdleCallback`; Safari has none: after
    // `IDLE_FALLBACK_MS`). Returns a handle to cancel it.
    whenIdle(fn) {
      const view = viewOf();
      if (view?.requestIdleCallback) {
        const id = view.requestIdleCallback(() => fn());
        return { cancel: () => view.cancelIdleCallback?.(id) };
      }
      if (!view?.setTimeout) return null;
      const id = view.setTimeout(fn, IDLE_FALLBACK_MS);
      return { cancel: () => view.clearTimeout(id) };
    },
    isDocumentHidden: () => Boolean(currentDocument()?.hidden),
    // Calls `fn` whenever the page is hidden or shown again; returns the removal.
    onVisibilityChange(fn) {
      const document = currentDocument();
      if (!document?.addEventListener) return () => {};
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
    // Calls `fn` whenever `element` changes size; returns the disconnect.
    observeResize(element, fn) {
      const Observer = viewOf()?.ResizeObserver;
      if (!Observer || !element) return () => {};
      const observer = new Observer(() => fn());
      observer.observe(element);
      return () => observer.disconnect();
    },
    log(level, ...args) { viewOf()?.console?.[level]?.(...args); },
    // Home Assistant's dialog of an entity, as a card asks for it (`hass-more-info`).
    moreInfo(entityId) {
      const host = getHost();
      const view = viewOf();
      if (!host?.dispatchEvent || !view?.CustomEvent) return false;
      host.dispatchEvent(new view.CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
      return true;
    },
    // Offers `text` as a file named `name`; the link is gone at once, its address shortly after.
    download(name, text, type = "text/plain") {
      const document = currentDocument();
      const view = viewOf();
      if (!document?.body || !view?.URL?.createObjectURL || !view.Blob) return false;
      const href = view.URL.createObjectURL(new view.Blob([text], { type }));
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      view.setTimeout(() => view.URL.revokeObjectURL(href), 0);
      return true;
    },
    // Home Assistant's in-app navigation: push the path and announce it to the router.
    navigate(path) {
      const view = viewOf();
      if (!view?.history?.pushState || typeof path !== "string" || !path.startsWith("/")) return false;
      view.history.pushState(null, "", path);
      const EventConstructor = view.CustomEvent || globalThis.CustomEvent;
      view.dispatchEvent(new EventConstructor("location-changed", { detail: { replace: false } }));
      return true;
    },
  };
}
