// Delegated pointer and form events for the whole shadow root. It decides only what kind of
// interaction happened; what it means is the element's to decide.
// See internal dev doc §5 "Aktionsvertrag".

const TEXT_INPUTS = new Set(["INPUT", "TEXTAREA"]);

export function createInteractionRuntime({ root, onAction = () => {} } = {}) {
  let connected = false;

  function blocked(target) {
    return target.disabled || target.getAttribute("aria-disabled") === "true";
  }

  function onClick(event) {
    const target = event.target?.closest?.("[data-action], [data-section]");
    if (!target || blocked(target)) return;
    // Text inputs report through `change`; a click into one is only a caret placement.
    if (TEXT_INPUTS.has(target.tagName)) return;
    if (target.getAttribute("role") === "tab") onAction({ type: "section", key: target.dataset.section, event, target });
    else if (target.dataset.action) onAction({ type: "action", event, target });
  }

  function onChange(event) {
    const target = event.target;
    if (!target || !TEXT_INPUTS.has(target.tagName) || !target.dataset?.action || blocked(target)) return;
    onAction({ type: "change", event, target });
  }

  function onInput(event) {
    const target = event.target;
    if (!target || target.dataset?.vocInput !== "entity") return;
    onAction({ type: "input", event, target });
  }

  return {
    connect() {
      if (connected || !root?.addEventListener) return;
      root.addEventListener("click", onClick);
      root.addEventListener("change", onChange);
      root.addEventListener("input", onInput);
      connected = true;
    },
    disconnect() {
      if (!connected) return;
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      root.removeEventListener("input", onInput);
      connected = false;
    },
  };
}
