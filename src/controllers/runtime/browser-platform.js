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
    requestAnimationFrame(fn) {
      const view = viewOf();
      if (view?.requestAnimationFrame) {
        const id = view.requestAnimationFrame(fn);
        return { cancel: () => view.cancelAnimationFrame(id) };
      }
      return this.setTimeout(fn, 16);
    },
    cancelAnimationFrame(handle) { handle?.cancel?.(); },
    prefersReducedMotion: () => Boolean(viewOf()?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
    isDocumentHidden: () => Boolean(currentDocument()?.hidden),
    onVisibilityChange(listener) {
      const target = currentDocument();
      if (!target) return () => {};
      target.addEventListener("visibilitychange", listener);
      return () => target.removeEventListener("visibilitychange", listener);
    },
    onColorSchemeChange(listener) {
      const query = viewOf()?.matchMedia?.("(prefers-color-scheme: dark)");
      if (!query?.addEventListener) return () => {};
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    createMutationObserver(callback) {
      const Observer = viewOf()?.MutationObserver;
      return typeof Observer === "function" ? new Observer(callback) : null;
    },
    createResizeObserver(callback) {
      const Observer = viewOf()?.ResizeObserver;
      return typeof Observer === "function" ? new Observer(callback) : null;
    },
    fontsReady: () => currentDocument()?.fonts?.ready || null,
    createEvent(type, init) {
      const EventConstructor = viewOf()?.Event || globalThis.Event;
      return new EventConstructor(type, init);
    },
    log(level, ...args) { viewOf()?.console?.[level]?.(...args); },
  };
}
