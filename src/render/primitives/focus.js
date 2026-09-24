// Focus across a full re-render. The card only ever moves focus it already holds: a render
// triggered by a state update must never pull focus into the card from elsewhere on the
// dashboard. See internal dev doc §5 "Fokusvertrag".

// Attributes that identify a control across renders, in order of specificity.
const IDENTITY_ATTRIBUTES = Object.freeze(["data-action", "data-job-id", "data-section", "data-field-path", "data-value", "role"]);

function quoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// A selector that finds the same control in the next render, or null when focus is outside
// the card.
export function captureFocus(root) {
  const active = root?.activeElement;
  if (!active) return null;
  if (active.id) return `#${quoted(active.id)}`;
  const parts = IDENTITY_ATTRIBUTES.filter((name) => active.hasAttribute?.(name)).map((name) => `[${name}="${quoted(active.getAttribute(name))}"]`);
  return parts.length ? parts.join("") : ".voc-root";
}

// Focuses the captured control, or the card root when that control no longer exists.
export function restoreFocus(root, selector) {
  if (!selector || !root) return null;
  const target = root.querySelector(selector) || root.querySelector(".voc-root");
  target?.focus?.();
  return target;
}

export function focusSelector(root, selector) {
  const target = root?.querySelector?.(selector);
  target?.focus?.();
  return target;
}
