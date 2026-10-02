// The browser behind the card: clock, timers, page visibility, size changes, console and Home
// Assistant's in-app navigation. Everything else reaches the browser through the DOM it renders.

function documentOf(getDocument) {
  return () => getDocument?.() || null;
}

export function createBrowserPlatform(getDocument) {
  const currentDocument = documentOf(getDocument);
  const viewOf = () => currentDocument()?.defaultView || null;
  return {
    now: () => Date.now(),
    setTimeout(fn, ms) {
      const view = viewOf();
      if (!view?.setTimeout) return null;
      const id = view.setTimeout(fn, Math.max(0, Number(ms) || 0));
      return { cancel: () => view.clearTimeout(id) };
    },
    clearTimeout(handle) { handle?.cancel?.(); },
    isDocumentHidden: () => Boolean(currentDocument()?.hidden),
    // Calls `fn` whenever `element` changes size; returns the disconnect.
    observeResize(element, fn) {
      const Observer = viewOf()?.ResizeObserver;
      if (!Observer || !element) return () => {};
      const observer = new Observer(() => fn());
      observer.observe(element);
      return () => observer.disconnect();
    },
    log(level, ...args) { viewOf()?.console?.[level]?.(...args); },
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
