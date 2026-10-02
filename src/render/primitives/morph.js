// Brings a live DOM subtree to the shape of freshly rendered markup while keeping every node
// that still corresponds: elements are matched by `data-key`, else by position and tag. A kept
// node keeps its focus, caret and scroll position. See internal dev doc §9 "Morph".
//
// Contract for markup: repeated siblings carry a `data-key`; form values are rendered as
// attributes (`value`, `checked`) and are not written into a control the user is editing.

const VALUE_ELEMENTS = new Set(["INPUT", "TEXTAREA"]);

function keyOf(node) {
  return node.nodeType === 1 ? node.getAttribute("data-key") : null;
}

function sameKind(current, next) {
  if (current.nodeType !== next.nodeType) return false;
  if (current.nodeType !== 1) return true;
  return current.nodeName === next.nodeName && keyOf(current) === keyOf(next);
}

function syncAttributes(current, next) {
  for (const { name } of [...current.attributes]) if (!next.hasAttribute(name)) current.removeAttribute(name);
  for (const { name, value } of [...next.attributes]) if (current.getAttribute(name) !== value) current.setAttribute(name, value);
}

// Live control state follows the markup unless the user is in that control right now.
function syncControlState(current, next, activeElement) {
  if (!VALUE_ELEMENTS.has(current.nodeName)) return;
  const editing = current === activeElement;
  if (current.nodeName === "TEXTAREA") {
    const value = next.textContent;
    if (!editing && current.value !== value) current.value = value;
    return;
  }
  const type = (current.getAttribute("type") || "text").toLowerCase();
  if (type === "checkbox" || type === "radio") {
    current.checked = next.hasAttribute("checked");
    return;
  }
  const value = next.getAttribute("value") ?? "";
  if (!editing && current.value !== value) current.value = value;
}

function morphNode(current, next, activeElement) {
  if (current.nodeType === 3 || current.nodeType === 8) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  syncAttributes(current, next);
  syncControlState(current, next, activeElement);
  // A textarea's text is its value, handled above; custom elements own their content.
  if (current.nodeName === "TEXTAREA" || current.nodeName.includes("-")) return;
  morphChildren(current, next, activeElement);
}

// Morphs `current` itself (attributes and subtree) into `next`.
export function morphElement(current, next, activeElement = null) {
  morphNode(current, next, activeElement);
}

export function morphChildren(parent, nextParent, activeElement = null) {
  const keyed = new Map();
  for (const child of parent.childNodes) {
    const key = keyOf(child);
    if (key !== null) keyed.set(key, child);
  }
  let cursor = parent.firstChild;
  for (const next of [...nextParent.childNodes]) {
    const key = keyOf(next);
    let match = null;
    if (key !== null) {
      const candidate = keyed.get(key);
      if (candidate && sameKind(candidate, next)) match = candidate;
    } else if (cursor && keyOf(cursor) === null && sameKind(cursor, next)) {
      match = cursor;
    }
    if (match) {
      if (match !== cursor) parent.insertBefore(match, cursor);
      else cursor = cursor.nextSibling;
      if (key !== null) keyed.delete(key);
      morphNode(match, next, activeElement);
    } else {
      parent.insertBefore(next, cursor);
    }
  }
  while (cursor) {
    const following = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = following;
  }
}
