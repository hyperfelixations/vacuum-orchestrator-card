function tabsFor(root) {
  return Array.from(root?.querySelectorAll?.('[role="tab"]') || []).filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true");
}

// Keyboard behaviour of the shell: the tab strip, Escape and the confirmation focus trap. Keys
// inside a form control are handed to `onControlKey` first.
export function createKeyboardRuntime({ root, ui, onControlKey = () => false } = {}) {
  let connected = false;
  let previousFocus = null;
  function focusTab(index, tabs) {
    const target = tabs[(index + tabs.length) % tabs.length];
    target?.focus?.();
    const key = target?.dataset?.section;
    if (key) ui?.setSection?.(key);
  }
  function onKeydown(event) {
    const target = event.target;
    if (onControlKey(event)) return;
    const tabs = tabsFor(root);
    if (target?.getAttribute?.("role") === "tab" && tabs.length) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); focusTab(tabs.indexOf(target) + 1, tabs); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); focusTab(tabs.indexOf(target) - 1, tabs); return; }
      if (event.key === "Home") { event.preventDefault(); focusTab(0, tabs); return; }
      if (event.key === "End") { event.preventDefault(); focusTab(tabs.length - 1, tabs); return; }
    }
    if (event.key === "Escape" && ui?.overlay) {
      event.preventDefault();
      ui.closeOverlay();
      previousFocus?.focus?.();
    }
    if (ui?.overlay?.kind === "confirm" && event.key === "Tab") {
      const focusable = Array.from(root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((node) => !node.disabled);
      if (focusable.length) {
        const index = focusable.indexOf(target);
        if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
        else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
      }
    }
  }
  return {
    connect() {
      if (connected || !root?.addEventListener) return;
      connected = true;
      previousFocus = root.ownerDocument?.activeElement || null;
      root.addEventListener("keydown", onKeydown);
    },
    disconnect() { if (!connected) return; root.removeEventListener("keydown", onKeydown); connected = false; previousFocus = null; },
    handleKeydown: onKeydown,
  };
}
