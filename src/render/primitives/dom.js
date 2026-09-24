export function computedStyleOf(element) {
  return element?.ownerDocument?.defaultView?.getComputedStyle?.(element) || null;
}

export function measuredWidth(element) {
  return element?.getBoundingClientRect?.().width || 0;
}

export function setText(node, value) {
  if (node) node.textContent = String(value ?? "");
}

export function setAttribute(node, name, value) {
  if (!node) return;
  if (value === null || value === undefined || value === false) node.removeAttribute(name);
  else node.setAttribute(name, value === true ? "" : String(value));
}

export function keyedPatch(parent, nextItems, { key, render, patch } = {}) {
  if (!parent) return [];
  const existing = new Map(Array.from(parent.children).map((node) => [node.dataset?.[key], node]));
  const used = new Set();
  const nodes = [];
  for (const item of nextItems || []) {
    const itemKey = String(item[key]);
    let node = existing.get(itemKey);
    if (node) {
      used.add(node);
      patch?.(node, item);
    } else {
      node = render(item);
      if (!node) continue;
    }
    nodes.push(node);
  }
  for (const node of existing.values()) if (!used.has(node) && !nodes.includes(node)) node.remove();
  for (const node of nodes) parent.appendChild(node);
  return nodes;
}

export const patchKeyedChildren = keyedPatch;
export const keyedChildren = keyedPatch;

export function replaceChildren(parent, nodes) {
  parent?.replaceChildren?.(...nodes);
}
