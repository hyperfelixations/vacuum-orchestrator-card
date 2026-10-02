// One card's own route and transient state: the view on screen, the overlay stack (a dialog
// can sit on an editor and give it back), page offsets, expanded blocks, the last command's
// notice and the focus the next render owes. Nothing here is shared between cards.
// See internal dev doc §9 "UI-Zustand".

export function createUIState() {
  let state = Object.freeze({ view: null, overlays: Object.freeze([]), pages: Object.freeze({}), expanded: Object.freeze([]), choices: Object.freeze({}), notice: null, focus: null });
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(state));
  const update = (patch, { silent = false } = {}) => {
    state = Object.freeze({ ...state, ...patch });
    if (!silent) publish();
    return state;
  };

  return {
    get snapshot() {
      return state;
    },
    get view() {
      return state.view;
    },
    get overlay() {
      return state.overlays[state.overlays.length - 1] ?? null;
    },
    setView(view) {
      return update({ view, overlays: Object.freeze([]) });
    },
    openOverlay(entry) {
      return update({ overlays: Object.freeze([...state.overlays, Object.freeze({ ...entry })]) });
    },
    // Merges into the top overlay, e.g. the next draft of an editor.
    updateOverlay(patch) {
      const top = this.overlay;
      if (!top) return state;
      return update({ overlays: Object.freeze([...state.overlays.slice(0, -1), Object.freeze({ ...top, ...patch })]) });
    },
    closeOverlay() {
      return update({ overlays: Object.freeze(state.overlays.slice(0, -1)) });
    },
    closeAllOverlays() {
      return update({ overlays: Object.freeze([]) });
    },
    setPage(scope, offset) {
      return update({ pages: Object.freeze({ ...state.pages, [scope]: Math.max(0, offset) }) });
    },
    toggle(key) {
      const expanded = state.expanded.includes(key) ? state.expanded.filter((item) => item !== key) : [...state.expanded, key];
      return update({ expanded: Object.freeze(expanded) });
    },
    // A per-card display choice, such as which map picture a robot card shows.
    choose(key, value) {
      return update({ choices: Object.freeze({ ...state.choices, [key]: value }) });
    },
    setNotice(notice) {
      return update({ notice: notice ? Object.freeze({ ...notice }) : null });
    },
    // A focus request is data for the next render, not a reason for one.
    requestFocus(selector) {
      return update({ focus: selector || null }, { silent: true });
    },
    consumeFocus() {
      const focus = state.focus;
      if (focus) update({ focus: null }, { silent: true });
      return focus;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
