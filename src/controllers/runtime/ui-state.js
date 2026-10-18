// One card's own route and transient state: the view on screen, the overlay stack (a dialog
// can sit on an editor and give it back; each overlay has an `id` for as long as it is open),
// page offsets, expanded blocks, the open menu, whether the card is wide and the job its queue
// detail shows, the last command's notice and the focus the next render owes.
// Nothing here is shared between cards. See internal dev doc §9 "UI-Zustand".

export function createUIState() {
  let opened = 0;
  let state = Object.freeze({ view: null, overlays: Object.freeze([]), pages: Object.freeze({}), expanded: Object.freeze([]), menu: null, wide: false, selectedJob: null, setupDeferred: false, choices: Object.freeze({}), notice: null, focus: null });
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
      return update({ view, overlays: Object.freeze([]), menu: null });
    },
    openOverlay(entry) {
      return update({ overlays: Object.freeze([...state.overlays, Object.freeze({ ...entry, id: ++opened })]), menu: null });
    },
    // The open overlay with this id, wherever it lies in the stack.
    find(id) {
      return state.overlays.find((overlay) => overlay.id === id) ?? null;
    },
    // Merges into the overlay with this id while it is open, e.g. a command's answer for it.
    patchOverlay(id, patch) {
      if (!this.find(id)) return state;
      return update({ overlays: Object.freeze(state.overlays.map((overlay) => (overlay.id === id ? Object.freeze({ ...overlay, ...patch }) : overlay))) });
    },
    // Merges into the top overlay, e.g. the next draft of an editor.
    updateOverlay(patch) {
      const top = this.overlay;
      if (!top) return state;
      return update({ overlays: Object.freeze([...state.overlays.slice(0, -1), Object.freeze({ ...top, ...patch })]) });
    },
    // The top `count` overlays.
    closeOverlay(count = 1) {
      return update({ overlays: Object.freeze(state.overlays.slice(0, Math.max(0, state.overlays.length - count))) });
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
    // The one open menu, by its key, or null.
    setMenu(key) {
      if ((key || null) === state.menu) return state;
      return update({ menu: key || null });
    },
    // The width tier where the queue shows list and detail side by side (LAY-03).
    // SET-10: "Later" sets the assistant aside until the card loads again; nothing is stored.
    deferSetup() {
      return update({ setupDeferred: true });
    },
    setWide(wide) {
      if (Boolean(wide) === state.wide) return state;
      return update({ wide: Boolean(wide) });
    },
    selectJob(jobId) {
      if ((jobId || null) === state.selectedJob) return state;
      return update({ selectedJob: jobId || null });
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
