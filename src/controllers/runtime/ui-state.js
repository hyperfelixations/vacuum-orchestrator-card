// The card's route: which section is on screen, which overlay covers it, the editor draft and
// the focus the next render owes. See internal dev doc §5 "UI-Zustand".
export function createUIState({ section = null } = {}) {
  let snapshot = { section, overlay: null, draft: null, focus: null, error: null };
  const listeners = new Set();
  const publish = () => { listeners.forEach((listener) => listener(snapshot)); };
  const update = (next) => { snapshot = next; publish(); return snapshot; };
  return {
    get section() { return snapshot.section; },
    get overlay() { return snapshot.overlay; },
    get draft() { return snapshot.draft; },
    get error() { return snapshot.error; },
    get focus() { return snapshot.focus; },
    setSection(key) { return update({ ...snapshot, section: key, overlay: null }); },
    // A confirmation interrupts the page underneath it and carries that page with it, so a
    // dismissed confirmation can give it back instead of dropping an unsaved draft.
    openOverlay(spec) {
      const next = spec || null;
      const interrupted = next?.kind === "confirm" && snapshot.overlay ? { overlay: snapshot.overlay, draft: snapshot.draft } : null;
      return update({
        ...snapshot,
        overlay: interrupted ? { ...next, interrupted } : next,
        draft: interrupted ? snapshot.draft : next?.draft ?? null,
      });
    },
    // `resume` returns to the interrupted page; without it the whole stack closes.
    closeOverlay({ resume = false } = {}) {
      const interrupted = resume ? snapshot.overlay?.interrupted : null;
      if (interrupted) return update({ ...snapshot, overlay: interrupted.overlay, draft: interrupted.draft, focus: null });
      return update({ ...snapshot, overlay: null, draft: null, focus: null });
    },
    // The draft is opaque here; the domain reducer produces each next draft.
    setDraft(draft) { return update({ ...snapshot, draft: draft ?? null }); },
    // A focus request is data for the next render, not a reason for one.
    requestFocus(selector) { snapshot = { ...snapshot, focus: selector || null }; return snapshot; },
    consumeFocus() { const focus = snapshot.focus; snapshot = { ...snapshot, focus: null }; return focus; },
    dismissError() { return update({ ...snapshot, error: null }); },
    setError(error) { return update({ ...snapshot, error }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot() { return snapshot; },
  };
}
