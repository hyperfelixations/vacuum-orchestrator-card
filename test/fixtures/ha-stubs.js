"use strict";

// The two Home Assistant elements the card puts in its own shadow root, `ha-card` and `ha-icon`
// (with the `ha-svg-icon` it draws through). Real Home Assistant registers them through its
// frontend bundle; this offline harness loads none, so without
// stubs they stay undefined elements with observable consequences for layout. They are
// registered as custom elements rather than styled from this document, because
// customElements.define() upgrades matching tags inside any shadow root while a light-DOM
// stylesheet never crosses that boundary. Loaded once, before the card bundle.
(function () {
  // An undefined custom element defaults to display:inline, and a non-atomic inline box can
  // neither be a size container nor clip its own overflow. The card declares
  // `container: voc-card / inline-size` on ha-card, so every @container rule would silently
  // never match and the accent line would bleed past the rounded corner. Real ha-card lays
  // itself out from its own shadow root, `:host { display: block; box-sizing: border-box;
  // position: relative }` around a slot, so the card's own rules win; the rest of its styling
  // (background, border, radius, shadow) the card re-declares itself.
  if (!customElements.get("ha-card")) {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML = "<style>:host { display: block; box-sizing: border-box; position: relative; }</style><slot></slot>";
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

  // As in Home Assistant's frontend: `ha-icon` is an unstyled host apart from `fill`, its shadow
  // root holds one `ha-svg-icon`, and that element carries the box (`--ha-icon-display`,
  // `vertical-align: middle`, `--mdc-icon-size` with 24 px by default) around a block SVG.
  const SVG_ICON_CSS = ":host { display: var(--ha-icon-display, inline-flex); align-items: center; justify-content: center; position: relative; vertical-align: middle; fill: var(--icon-primary-color, currentcolor); width: var(--mdc-icon-size, 24px); height: var(--mdc-icon-size, 24px); } svg { width: 100%; height: 100%; pointer-events: none; display: block; }";

  class HaSvgIconStub extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }

    set path(value) {
      this.shadowRoot.innerHTML = `<style>${SVG_ICON_CSS}</style><svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" role="img" aria-hidden="true"><g><path class="primary-path" d="${value}"></path></g></svg>`;
    }
  }

  class HaIconStub extends HTMLElement {
    static get observedAttributes() {
      return ["icon"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = "<style>:host { fill: currentcolor; }</style><ha-svg-icon></ha-svg-icon>";
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
      this.shadowRoot.querySelector("ha-svg-icon").path = (paths && paths[exportName(name)]) || DOT;
    }
  }

  if (!customElements.get("ha-svg-icon")) {
    customElements.define("ha-svg-icon", HaSvgIconStub);
  }
  if (!customElements.get("ha-icon")) {
    customElements.define("ha-icon", HaIconStub);
  }
})();
