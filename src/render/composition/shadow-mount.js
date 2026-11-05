// Owns exactly two nodes of the shadow root — the stylesheet and `ha-card` — and inside the
// card exactly one, `.voc-root`. Everything else in the shadow root or the card belongs to
// someone else (card-mod) and is never touched. Updates morph `.voc-root` in place; markup equal
// to the last mounted is not parsed again (`changed: false`). The card carries the frame:
// `data-frame` and, for "lock", `--voc-frame-height`; in "auto" its floor `--voc-frame-min`.

import { morphElement } from "../primitives/morph.js";

export function createShadowMount(root) {
  let style = null;
  let surface = null;
  let cardRoot = null;
  let fallbackText = null;
  let frame = { mode: "auto", heightPx: null, minPx: null };
  // The stylesheet and markup last mounted.
  let shown = null;

  // Writes only what differs: a write is a change the page lays out again (UI-31).
  function applyFrame() {
    if (!surface) return;
    const mode = frame.mode === "auto" ? null : frame.mode;
    if (mode === null) surface.removeAttribute("data-frame");
    else if (surface.getAttribute("data-frame") !== mode) surface.setAttribute("data-frame", mode);
    const property = (name, value) => {
      if (value === null) surface.style.removeProperty(name);
      else if (surface.style.getPropertyValue(name) !== value) surface.style.setProperty(name, value);
    };
    property("--voc-frame-height", frame.mode === "lock" ? `${frame.heightPx}px` : null);
    property("--voc-frame-min", frame.mode === "auto" && frame.minPx !== null ? `${frame.minPx}px` : null);
  }

  const mounted = () => Boolean(style && surface && style.parentNode === root && surface.parentNode === root);

  function firstElement(fragment) {
    for (const node of fragment.childNodes) if (node.nodeType === 1) return node;
    return null;
  }

  return {
    // `html` is the `.voc-root` element's markup. Reports whether the DOM changed.
    mount(context, { css, html }) {
      if (shown?.css === css && shown.html === html && mounted() && cardRoot?.parentNode === surface) return { changed: false };
      const next = firstElement(context.fragment(html));
      if (!next) return { changed: false };
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
      shown = { css, html };
      if (!cardRoot || cardRoot.parentNode !== surface) {
        cardRoot = next;
        surface.appendChild(next);
        return { changed: true };
      }
      morphElement(cardRoot, next, root.activeElement ?? null);
      return { changed: true };
    },
    // mode: "auto" (the content's height, at least minPx), "fill" (the host's height) or "lock"
    // (heightPx).
    setFrame({ mode = "auto", heightPx = null, minPx = null } = {}) {
      frame = { mode, heightPx, minPx };
      applyFrame();
    },
    // The last resort when even the failure markup cannot be built.
    showText(text) {
      if (style?.parentNode === root) root.removeChild(style);
      if (surface?.parentNode === root) root.removeChild(surface);
      style = surface = cardRoot = null;
      shown = null;
      if (!fallbackText) fallbackText = root.ownerDocument.createTextNode("");
      fallbackText.nodeValue = String(text ?? "");
      if (fallbackText.parentNode !== root) root.appendChild(fallbackText);
    },
    root: () => cardRoot,
    owned: () => [style, surface, cardRoot, fallbackText].filter(Boolean),
  };
}
