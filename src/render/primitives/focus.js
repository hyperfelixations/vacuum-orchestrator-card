// Focus across a render. The card only ever moves focus it already holds: an update must never
// pull focus into the card from elsewhere on the dashboard. A control that moved (a reordered
// row) is found again by its identity attributes. See internal dev doc §9 "Fokusvertrag".

const IDENTITY_ATTRIBUTES = Object.freeze(["data-action", "data-args", "data-field", "data-view", "data-value", "role"]);

function quoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function captureFocus(root) {
  const active = root?.activeElement;
  if (!active) return null;
  if (active.id) return `#${quoted(active.id)}`;
  const parts = IDENTITY_ATTRIBUTES.filter((name) => active.hasAttribute?.(name)).map((name) => `[${name}="${quoted(active.getAttribute(name))}"]`);
  return parts.length ? parts.join("") : ".voc-root";
}

// Whether the focused control shows its focus ring, so a moved focus keeps the user's input
// modality: no ring after a click, a ring after keyboard use.
export function focusRingShown(root) {
  try {
    return root?.activeElement?.matches?.(":focus-visible") === true;
  } catch {
    return true;
  }
}

function focusOn(target, visible) {
  target?.focus?.({ preventScroll: true, focusVisible: visible });
  return target;
}

// Re-focuses the captured control when the render lost it; the card root when it is gone.
export function restoreFocus(root, selector, { visible = true } = {}) {
  if (!selector || !root || root.activeElement) return null;
  return focusOn(root.querySelector(selector) || root.querySelector(".voc-root"), visible);
}

export function focusSelector(root, selector, { visible = true } = {}) {
  return focusOn(root?.querySelector?.(selector), visible);
}
