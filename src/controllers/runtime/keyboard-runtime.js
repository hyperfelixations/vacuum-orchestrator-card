// Keyboard behaviour of the shell: arrow keys in the tab strip, Escape for the top overlay and
// a focus trap inside dialogs. Keys inside a card control go to `onControlKey` first.

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function createKeyboardRuntime({ root, onView = () => {}, onEscape = () => false, onControlKey = () => false } = {}) {
  let connected = false;

  function tabs() {
    return Array.from(root.querySelectorAll('[role="tab"]'));
  }

  function moveTab(event, index, list) {
    event.preventDefault();
    const target = list[(index + list.length) % list.length];
    target?.focus?.();
    if (target?.dataset?.view) onView(target.dataset.view);
  }

  function onKeydown(event) {
    const target = event.target;
    if (onControlKey(event)) return;
    if (target?.getAttribute?.("role") === "tab") {
      const list = tabs();
      const index = list.indexOf(target);
      if (event.key === "ArrowRight") return moveTab(event, index + 1, list);
      if (event.key === "ArrowLeft") return moveTab(event, index - 1, list);
      if (event.key === "Home") return moveTab(event, 0, list);
      if (event.key === "End") return moveTab(event, list.length - 1, list);
    }
    if (event.key === "Escape" && onEscape()) {
      event.preventDefault();
      return;
    }
    const dialog = target?.closest?.('[role="dialog"], [role="alertdialog"]');
    if (dialog && event.key === "Tab") {
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (!focusable.length) return;
      const index = focusable.indexOf(target);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
  }

  return {
    connect() {
      if (connected || !root?.addEventListener) return;
      root.addEventListener("keydown", onKeydown);
      connected = true;
    },
    disconnect() {
      if (!connected) return;
      root.removeEventListener("keydown", onKeydown);
      connected = false;
    },
    handleKeydown: onKeydown,
  };
}
