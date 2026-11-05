// The map pictures of a card: placed after each render, again whenever a picture loads, also one
// whose address changed, and on a resize; each stage decides for itself, from its own picture.
// Boundary: the runtime against jsdom, never the assembled card.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const PICTURES = { "landscape.png": [400, 300], "portrait.png": [300, 400], "wide.png": [800, 300] };

async function setup(stages) {
  const { createMapRuntime } = await import("../../../src/controllers/runtime/map-runtime.js");
  const { window } = new JSDOM("<!doctype html><div id=host></div>");
  const host = window.document.getElementById("host");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = stages.map(({ rotation, src }) => `<div data-map-stage data-rotation="${rotation}"><img src="${src}"></div>`).join("");
  for (const stage of root.querySelectorAll("[data-map-stage]")) Object.defineProperty(stage, "clientWidth", { value: 350, configurable: true });
  // A picture is complete with its natural size once `loaded`; a new address starts it over.
  for (const image of root.querySelectorAll("img")) {
    let loaded = image.getAttribute("src");
    Object.defineProperty(image, "complete", { get: () => loaded === image.getAttribute("src"), configurable: true });
    Object.defineProperty(image, "naturalWidth", { get: () => (loaded === image.getAttribute("src") ? PICTURES[loaded][0] : 0), configurable: true });
    Object.defineProperty(image, "naturalHeight", { get: () => (loaded === image.getAttribute("src") ? PICTURES[loaded][1] : 0), configurable: true });
    image.finishLoading = () => {
      loaded = image.getAttribute("src");
      image.dispatchEvent(new window.Event("load"));
    };
  }
  let resized = null;
  const platform = {
    observeResize(element, fn) {
      resized = fn;
      return () => (resized = null);
    },
  };
  const runtime = createMapRuntime({ root, host, platform, viewportHeight: () => 700 });
  runtime.connect();
  const stage = (index) => root.querySelectorAll("[data-map-stage]")[index];
  return { runtime, root, stage, resize: () => resized?.(), connected: () => resized !== null };
}

test("a picture whose address changes is placed again each time its new picture loads", async () => {
  const env = await setup([{ rotation: "auto", src: "landscape.png" }]);
  env.runtime.sync();
  const image = env.stage(0).querySelector("img");
  assert.equal(env.stage(0).dataset.rotated, "true");
  // In a 350 × 490 px box a portrait picture stands, a landscape or wide one turns.
  for (const [src, rotated] of [["portrait.png", "false"], ["wide.png", "true"], ["portrait.png", "false"]]) {
    image.setAttribute("src", src);
    env.runtime.sync();
    image.finishLoading();
    assert.equal(env.stage(0).dataset.rotated, rotated, src);
    assert.equal(image.hasAttribute("data-waiting"), false);
  }
});

test("stages showing the same picture decide on their own, before their own rotation policy", async () => {
  const env = await setup([{ rotation: "none", src: "landscape.png" }, { rotation: "auto", src: "landscape.png" }]);
  env.runtime.sync();
  assert.deepEqual([env.stage(0).dataset.rotated, env.stage(1).dataset.rotated], ["false", "true"]);
  env.stage(0).dataset.rotation = "auto";
  env.runtime.sync();
  assert.equal(env.stage(0).dataset.rotated, "true", "allowed now, the stage turns its picture");
});

test("a resize places the pictures again; disconnected, the runtime stops observing", async () => {
  const env = await setup([{ rotation: "auto", src: "landscape.png" }]);
  env.runtime.sync();
  Object.defineProperty(env.stage(0), "clientWidth", { value: 900, configurable: true });
  env.resize();
  assert.equal(env.stage(0).dataset.rotated, "false", "a wide card shows the map upright");
  env.runtime.disconnect();
  assert.equal(env.connected(), false);
});
