// The robot maps of a card (UI-10): every stage is placed after each render, whenever its picture
// loads, also a new address on the same node, and when the card changes size. Each stage keeps
// its own decision; see internal dev doc §9 "Kartenbild".

import { placeMap } from "./map-rotation.js";

const STAGE = "[data-map-stage]";

export function createMapRuntime({ root, host, platform, viewportHeight }) {
  // A rebuilt stage is a new node and decides anew.
  const decisions = new WeakMap();
  let stopResize = null;

  function place(stage) {
    const image = stage.querySelector("img");
    if (!image?.complete || !image.naturalWidth) return;
    decisions.set(stage, placeMap(stage, image, { viewportHeight: viewportHeight(), previous: decisions.get(stage) ?? null }));
  }

  function sync() {
    for (const stage of root.querySelectorAll?.(STAGE) ?? []) place(stage);
  }

  // `load` does not bubble; the root hears it while capturing.
  const onLoad = (event) => {
    const image = event.target;
    const stage = image?.tagName === "IMG" ? image.closest?.(STAGE) : null;
    if (stage) place(stage);
  };

  return {
    connect() {
      if (stopResize) return;
      root.addEventListener("load", onLoad, true);
      stopResize = platform.observeResize(host, sync);
    },
    disconnect() {
      root.removeEventListener("load", onLoad, true);
      stopResize?.();
      stopResize = null;
    },
    sync,
  };
}
