// Owns exactly two nodes of the shadow root — the stylesheet and `ha-card` — and inside the
// card exactly one, `.voc-root`. Everything else in the shadow root or the card belongs to
// someone else (card-mod) and is never touched. Updates morph `.voc-root` in place. The card
// carries the frame: `data-frame` and, for "lock", `--voc-frame-height`.

import { morphElement } from "../primitives/morph.js";

export function createShadowMount(root) {
  let style = null;
  let surface = null;
  let cardRoot = null;
  let fallbackText = null;
  let frame = { mode: "auto", heightPx: null };

  function applyFrame() {
    if (!surface) return;
    if (frame.mode === "auto") surface.removeAttribute("data-frame");
    else surface.setAttribute("data-frame", frame.mode);
    if (frame.mode === "lock") surface.style.setProperty("--voc-frame-height", `${frame.heightPx}px`);
    else surface.style.removeProperty("--voc-frame-height");
  }

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
        applyFrame();
      }
      if (style.textContent !== css) style.textContent = css;
      if (!cardRoot || cardRoot.parentNode !== surface) {
        cardRoot = next;
        surface.appendChild(next);
        return;
      }
      morphElement(cardRoot, next, root.activeElement ?? null);
    },
    // mode: "auto" (the content's height), "fill" (the host's height) or "lock" (heightPx).
    setFrame({ mode = "auto", heightPx = null } = {}) {
      frame = { mode, heightPx };
      applyFrame();
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
