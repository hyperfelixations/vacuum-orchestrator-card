// When the card cannot show sections at all. Only a backend the card can never reach in this
// state replaces the body; a dropped connection or a read-only user keeps the last snapshot
// visible, because hiding it would destroy information the user still needs.

const BLOCKING = Object.freeze({
  backend_missing: "unavailable.backendMissing",
  backend_not_loaded: "unavailable.backendNotLoaded",
  api_incompatible: "unavailable.apiIncompatible",
});

export function buildShellState(model = {}, texts = { t: (key) => key }) {
  const state = model.connection?.state || "connecting";
  const key = BLOCKING[state];
  if (key) return { kind: state, available: false, message: texts.t(key) };
  return { kind: "ready", available: true, message: "" };
}

export { BLOCKING };
