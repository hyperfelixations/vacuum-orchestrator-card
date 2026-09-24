// Pure event-delegation helper for card-owned controls. The runtime passes the native event in;
// this module never reads a global document or decides a draft value.

function controlFor(target) {
  return target?.closest?.("[data-control]") || null;
}

function enabledButtons(control, selector = "button") {
  return Array.from(control?.querySelectorAll?.(selector) || []).filter(
    (button) => !button.disabled && button.getAttribute("aria-disabled") !== "true"
  );
}

function moveFocus(event, buttons, index, activate = true) {
  if (!buttons.length) return false;
  event.preventDefault();
  const target = buttons[(index + buttons.length) % buttons.length];
  target.focus?.();
  if (activate) target.click?.();
  return true;
}

function selectedIndex(buttons) {
  const focused = buttons.findIndex((button) => button === button.ownerDocument?.activeElement);
  if (focused >= 0) return focused;
  const selected = buttons.findIndex((button) => button.getAttribute("aria-checked") === "true" || button.getAttribute("aria-selected") === "true");
  return selected >= 0 ? selected : 0;
}

function stepperKey(event, control, target) {
  if (!target?.matches?.("input[data-voc-input='number']")) return false;
  const action = {
    ArrowUp: "increment",
    PageUp: "increment",
    ArrowDown: "decrement",
    PageDown: "decrement",
  }[event.key];
  if (action) {
    const button = control.querySelector(`[data-stepper-action="${action}"]`);
    if (button) {
      event.preventDefault();
      button.click?.();
      target.focus?.();
      return true;
    }
  }
  if (event.key !== "Home" && event.key !== "End") return false;
  const bound = event.key === "Home" ? target.min : target.max;
  if (bound === "") return false;
  event.preventDefault();
  target.value = bound;
  const inputEvent = target.ownerDocument?.defaultView?.Event;
  if (typeof inputEvent === "function") target.dispatchEvent(new inputEvent("input", { bubbles: true }));
  return true;
}

function comboboxKey(event, control, target) {
  if (!target?.matches?.("[role='combobox']")) return false;
  const list = control.querySelector(".voc-combobox-list");
  const buttons = enabledButtons(list, "[role='option']");
  if (event.key === "Escape") {
    event.preventDefault();
    control.setAttribute("aria-expanded", "false");
    target.setAttribute("aria-expanded", "false");
    if (list) list.hidden = true;
    target.removeAttribute("aria-activedescendant");
    return true;
  }
  if (!buttons.length || !["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return false;
  const current = selectedIndex(buttons);
  if (event.key === "Enter") return moveFocus(event, buttons, current, true);
  const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + (event.key === "ArrowDown" ? 1 : -1);
  const moved = moveFocus(event, buttons, index, false);
  if (moved) target.setAttribute("aria-activedescendant", buttons[(index + buttons.length) % buttons.length].id);
  return moved;
}

function optionKey(event, control, target) {
  if (!target?.matches?.("[role='radio'], [role='option']")) return false;
  const buttons = enabledButtons(control, "[role='radio'], [role='option']");
  const current = selectedIndex(buttons);
  if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key)) {
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1);
    return moveFocus(event, buttons, index, true);
  }
  return false;
}

export function handleControlKeydown(event) {
  const target = event?.target;
  const control = controlFor(target);
  if (!control) return false;
  if (control.dataset.control === "stepper" && stepperKey(event, control, target)) return true;
  if (control.dataset.control === "entity-combobox" && comboboxKey(event, control, target)) return true;
  return optionKey(event, control, target);
}

export default handleControlKeydown;
