export function createResizeRuntime({ platform, onMeasure = () => {} } = {}) {
  let observer = null;
  let frame = null;
  return {
    connect(element) {
      if (observer || !element) return;
      observer = platform?.createResizeObserver?.(() => {
        if (frame) return;
        frame = platform.requestAnimationFrame(() => { frame = null; onMeasure(); });
      });
      observer?.observe?.(element);
    },
    disconnect() { platform?.cancelAnimationFrame?.(frame); frame = null; observer?.disconnect?.(); observer = null; },
    isObserving: () => Boolean(observer),
    // A queued measurement means the layout is not final yet; browser tests wait on this
    // instead of on a duration.
    hasPendingFrame: () => frame !== null,
  };
}
