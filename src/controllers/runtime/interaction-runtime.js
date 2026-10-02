// Delegated pointer and form events for the whole shadow root. It decides only what kind of
// interaction happened and reads its arguments; what it means is the element's to decide.
// See internal dev doc §9 "Aktionsvertrag".

const TEXT_INPUTS = new Set(["INPUT", "TEXTAREA"]);

function argsOf(target) {
  const raw = target?.dataset?.args;
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_error) {
    return {};
  }
}

function inert(target) {
  return target.disabled || target.getAttribute("aria-disabled") === "true";
}

export function createInteractionRuntime({ root, onAction = () => {} } = {}) {
  let connected = false;

  function onClick(event) {
    const target = event.target?.closest?.("[data-action], [data-view]");
    if (!target || inert(target)) return;
    if (TEXT_INPUTS.has(target.tagName)) return;
    if (target.dataset.view && target.getAttribute("role") === "tab") {
      onAction({ type: "view", view: target.dataset.view, target, event });
      return;
    }
    if (target.dataset.action) onAction({ type: "action", action: target.dataset.action, args: argsOf(target), target, event });
  }

  // Text, number and checkbox fields report their value; `data-field` names the draft field.
  function onInput(event) {
    const target = event.target;
    if (!target?.dataset?.field || inert(target)) return;
    onAction({ type: event.type === "change" ? "change" : "input", field: target.dataset.field, args: argsOf(target), target, event });
  }

  return {
    connect() {
      if (connected || !root?.addEventListener) return;
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onInput);
      connected = true;
    },
    disconnect() {
      if (!connected) return;
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onInput);
      connected = false;
    },
  };
}
