// Decides whether a render is needed. It owns the last committed signature and the on-screen
// view model, and commits only after a successful render. Every render morphs the DOM, so
// there is no separate structure or patch path. See internal dev doc §9 "Render-Controller".

export const RENDER_PATH = Object.freeze({ SKIP: "skip", RENDER: "render" });

export function createRenderController({ computeViewModel, renderView } = {}) {
  let signature = null;
  let lastViewModel = null;
  let rendered = false;

  return {
    render({ signature: next, force = false } = {}) {
      if (!force && rendered && next === signature) return RENDER_PATH.SKIP;
      const viewModel = computeViewModel();
      renderView(viewModel);
      signature = next;
      lastViewModel = viewModel;
      rendered = true;
      return RENDER_PATH.RENDER;
    },
    get lastViewModel() {
      return lastViewModel;
    },
    get hasRendered() {
      return rendered;
    },
    invalidate() {
      signature = null;
    },
    markFailed() {
      rendered = false;
      signature = null;
      lastViewModel = null;
    },
  };
}
