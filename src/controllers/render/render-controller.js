export const RENDER_PATH = Object.freeze({
  DEFERRED: "deferred",
  SKIP: "skip",
  FULL: "full",
  STRUCTURE: "structure",
  CONTENT: "content",
  EMPTY: "empty",
});

// Decides whether a render is needed and how much of one. It owns the three signatures, the
// deferred-render debt and the on-screen view model; the element performs the paths.
// See internal dev doc §5 "Render-Controller".
export function createRenderController({ computeViewModel, computeStructureSignature, isDragging = () => false, renderAll, updateEmpty, updateContent } = {}) {
  let dataSignature = null;
  let structuralSignature = null;
  let structureSignature = null;
  let rendered = false;
  let pending = false;
  let lastViewModel = null;
  let preConfigVisualKey;

  return {
    render({ dataSignature: nextDataSignature, structuralConfigSignature: nextStructuralSignature, allowSkip = true } = {}) {
      if (isDragging()) {
        pending = true;
        return RENDER_PATH.DEFERRED;
      }
      if (allowSkip && rendered && nextDataSignature === dataSignature && nextStructuralSignature === structuralSignature) {
        pending = false;
        return RENDER_PATH.SKIP;
      }
      const viewModel = computeViewModel();
      const wasRendered = rendered;
      const nextStructure = computeStructureSignature(viewModel);
      const full = !rendered || nextStructure !== structureSignature || nextStructuralSignature !== structuralSignature;
      try {
        if (full) renderAll(viewModel, { isFirstRender: !rendered, preConfigVisualKey });
        else if (viewModel.empty) updateEmpty(viewModel);
        else updateContent(viewModel);
      } catch (error) {
        pending = true;
        throw error;
      }
      dataSignature = nextDataSignature;
      structuralSignature = nextStructuralSignature;
      structureSignature = nextStructure;
      lastViewModel = viewModel;
      rendered = true;
      pending = false;
      if (full) return wasRendered ? RENDER_PATH.STRUCTURE : RENDER_PATH.FULL;
      return viewModel.empty ? RENDER_PATH.EMPTY : RENDER_PATH.CONTENT;
    },
    get lastViewModel() { return lastViewModel; },
    get hasRendered() { return rendered; },
    get isRenderPending() { return pending; },
    invalidateDataSignature() { dataSignature = null; },
    markFailed() { rendered = false; dataSignature = null; structuralSignature = null; structureSignature = null; lastViewModel = null; pending = true; },
    capturePreConfigVisualKey(key) { preConfigVisualKey = key; },
    releasePreConfigVisualKey() { preConfigVisualKey = undefined; },
  };
}
