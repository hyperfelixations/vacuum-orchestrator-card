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

  // Material Design Icons are not shipped offline. These are the names the card can actually
  // emit, drawn on the same 24x24 grid as the real set so icon boxes and text baselines match
  // production; an unknown name falls back to a neutral dot.
  const PATHS = {
    "arrow-up": "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",
    "arrow-down": "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",
    "arrow-collapse-up": "M4,2H20V4H4V2M13,15V21H11V15H6L12,9L18,15H13Z",
    "arrow-collapse-down": "M4,22H20V20H4V22M13,9V3H11V9H6L12,15L18,9H13Z",
    "delete-outline":
      "M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z",
    "pencil-outline":
      "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25M5.92,19H5V18.08L14.06,9.02L14.98,9.94L5.92,19Z",
    play: "M8,5.14V19.14L19,12.14L8,5.14Z",
    "play-outline": "M8,5.14V19.14L19,12.14L8,5.14M10,8.64L15.27,12.14L10,15.64V8.64Z",
    pause: "M14,19H18V5H14M6,19H10V5H6V19Z",
    "stop-circle-outline":
      "M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M9,9H15V15H9V9Z",
    restore:
      "M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3M12,8V13L16.28,15.54L17,14.33L13.5,12.25V8H12Z",
    refresh:
      "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",
    plus: "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
    "chevron-left": "M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z",
    "chevron-right": "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",
    check: "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",
    help: "M10,19H13V22H10V19M12,2C17.35,2.22 19.68,7.62 16.5,11.67C15.67,12.67 14.33,13.33 13.67,14.17C13,15 13,16 13,17H10C10,15.33 10,13.92 10.67,12.92C11.33,11.92 12.67,11.33 13.5,10.67C15.92,8.43 15.32,5.26 12,5A3,3 0 0,0 9,8H6A6,6 0 0,1 12,2Z",
    battery:
      "M16,20H8V6H16M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4Z",
    water: "M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25S18,10 18,14A6,6 0 0,1 12,20Z",
    "floor-plan": "M10,5V10H9V5H5V13H9V12H10V19H13V15H15V19H19V5H10M18,6V11H16V6H18M11,6H15V11H11V6M18,12V18H16V12H18M11,14H15V16H11V14M6,6H8V12H6V6Z",
    "robot-vacuum":
      "M12,2A9,9 0 0,1 21,11V22H15V19H9V22H3V11A9,9 0 0,1 12,2M12,4A7,7 0 0,0 5,11V20H7V17H17V20H19V11A7,7 0 0,0 12,4M12,6A5,5 0 0,1 17,11H15A3,3 0 0,0 12,8V6Z",
    dot: "M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z",
  };

  class HaIconStub extends HTMLElement {
    static get observedAttributes() {
      return ["icon"];
    }

    connectedCallback() {
      this._render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _render() {
      const name = String(this.getAttribute("icon") || "").replace(/^mdi:/u, "");
      const path = PATHS[name] || PATHS.dot;
      this.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" focusable="false"><path d="${path}"></path></svg>`;
      this.style.display = "inline-flex";
      this.style.alignItems = "center";
      this.style.justifyContent = "center";
    }
  }

  if (!customElements.get("ha-icon")) {
    customElements.define("ha-icon", HaIconStub);
  }
})();
