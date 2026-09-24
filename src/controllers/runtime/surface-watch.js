export function createSurfaceWatch({ platform, onChange, getStyleContainers = () => [], getForeignNodes = () => [] } = {}) {
  let observer = null;
  let colorUnsubscribe = null;
  let frame = null;
  function schedule() {
    if (frame) return;
    frame = platform.requestAnimationFrame(() => { frame = null; onChange?.(); });
  }
  function observe(element) {
    observer?.disconnect?.();
    if (!observer || !element) return;
    const documentElement = element.ownerDocument?.documentElement;
    if (documentElement) observer.observe(documentElement, { attributes: true });
    observer.observe(element, { attributes: true, attributeFilter: ["style", "class"] });
    getStyleContainers().forEach((node) => observer.observe(node, { childList: true }));
    getForeignNodes().forEach((node) => observer.observe(node, { attributes: true, characterData: true, childList: true, subtree: true }));
  }
  return {
    observe(element) {
      this.disconnect();
      if (!element) return;
      colorUnsubscribe = platform.onColorSchemeChange(schedule);
      observer = platform.createMutationObserver((records) => {
        if (records.some((record) => record.type === "childList")) observe(element);
        schedule();
      });
      observe(element);
    },
    disconnect() { colorUnsubscribe?.(); colorUnsubscribe = null; observer?.disconnect?.(); observer = null; platform.cancelAnimationFrame?.(frame); frame = null; },
  };
}
