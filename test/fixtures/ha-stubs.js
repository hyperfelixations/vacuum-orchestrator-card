"use strict";

// The two Home Assistant elements the card puts in its own shadow root. Real Home Assistant
// registers them through its frontend bundle; this offline harness loads none, so without
// stubs they stay undefined elements with observable consequences for layout. They are
// registered as custom elements rather than styled from this document, because
// customElements.define() upgrades matching tags inside any shadow root while a light-DOM
// stylesheet never crosses that boundary. Loaded once, before the card bundle.
(function () {
  // An undefined custom element defaults to display:inline, and a non-atomic inline box can
  // neither be a size container nor clip its own overflow. The card declares
  // `container: voc-card / inline-size` on ha-card, so every @container rule would silently
  // never match and the accent line would bleed past the rounded corner. Real ha-card is a
  // block element; the rest of its styling (background, border, radius, shadow) the card
  // re-declares itself.
  if (!customElements.get("ha-card")) {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
        }
      }
    );
  }

  // Material Design Icons come from the pinned `@mdi/js` test dependency, the same path data
  // Home Assistant's own icon set draws, so icon boxes, shapes and text baselines match
  // production. The module loads once; `window.__vocIconsReady` resolves when every stub can draw
  // its real icon, and tests wait for it before a screenshot. An unknown name draws a dot.
  const DOT = "M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z";
  let paths = null;
  const live = new Set();
  const exportName = (name) => `mdi${name.replace(/(^|-)([a-z0-9])/g, (_match, _dash, letter) => letter.toUpperCase())}`;
  window.__vocIconsReady = import("/node_modules/@mdi/js/mdi.js").then((module) => {
    paths = module;
    live.forEach((icon) => icon._render());
  });

  class HaIconStub extends HTMLElement {
    static get observedAttributes() {
      return ["icon"];
    }

    connectedCallback() {
      live.add(this);
      this._render();
    }

    disconnectedCallback() {
      live.delete(this);
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _render() {
      const name = String(this.getAttribute("icon") || "").replace(/^mdi:/u, "");
      const path = (paths && paths[exportName(name)]) || DOT;
      this.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" focusable="false" aria-hidden="true"><path d="${path}"></path></svg>`;
      this.style.display = "inline-flex";
      this.style.alignItems = "center";
      this.style.justifyContent = "center";
    }
  }

  if (!customElements.get("ha-icon")) {
    customElements.define("ha-icon", HaIconStub);
  }
})();
