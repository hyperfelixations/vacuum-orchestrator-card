// Owns exactly two nodes of the shadow root — the stylesheet and `ha-card` — and inside the
// card exactly one, `.voc-root`. Everything else in the shadow root or the card belongs to
// someone else (card-mod) and is never touched. Updates morph `.voc-root` in place.

import { morphElement } from "../primitives/morph.js";

export function createShadowMount(root) {
  let style = null;
  let surface = null;
  let cardRoot = null;
  let fallbackText = null;

  const mounted = () => Boolean(style && surface && style.parentNode === root && surface.parentNode === root);

  function firstElement(fragment) {
    for (const node of fragment.childNodes) if (node.nodeType === 1) return node;
    return null;
  }

  return {
    // `html` is the `.voc-root` element's markup.
    mount(context, { css, html }) {
      const next = firstElement(context.fragment(html));
      if (!next) return;
      if (fallbackText?.parentNode === root) root.removeChild(fallbackText);
      fallbackText = null;
      if (!mounted()) {
        style = context.ownerDocument.createElement("style");
        surface = context.ownerDocument.createElement("ha-card");
        surface.className = "voc-card";
        root.insertBefore(style, root.firstChild);
        root.insertBefore(surface, style.nextSibling);
        cardRoot = null;
      }
      if (style.textContent !== css) style.textContent = css;
      if (!cardRoot || cardRoot.parentNode !== surface) {
        cardRoot = next;
        surface.appendChild(next);
        return;
      }
      morphElement(cardRoot, next, root.activeElement ?? null);
    },
    // The last resort when even the failure markup cannot be built.
    showText(text) {
      if (style?.parentNode === root) root.removeChild(style);
      if (surface?.parentNode === root) root.removeChild(surface);
      style = surface = cardRoot = null;
      if (!fallbackText) fallbackText = root.ownerDocument.createTextNode("");
      fallbackText.nodeValue = String(text ?? "");
      if (fallbackText.parentNode !== root) root.appendChild(fallbackText);
    },
    root: () => cardRoot,
    owned: () => [style, surface, cardRoot, fallbackText].filter(Boolean),
  };
}
