// The enlarged robot map (UI-10): turned a quarter only where that shows it clearly larger, laid
// out with width and height swapped, and decided again only when its box changes noticeably.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const load = () => import("../../../src/controllers/runtime/map-rotation.js");

test("a map turns only where that shows it more than 15 % larger", async () => {
  const { shouldRotate } = await load();
  const landscape = { imageWidth: 400, imageHeight: 300 };
  assert.equal(shouldRotate({ boxWidth: 350, boxHeight: 500, ...landscape }), true, "a wide map on a tall phone");
  assert.equal(shouldRotate({ boxWidth: 800, boxHeight: 500, ...landscape }), false, "a wide map in a wide box");
  assert.equal(shouldRotate({ boxWidth: 300, boxHeight: 330, ...landscape }), false, "a gain under 15 % keeps it upright");
  assert.equal(shouldRotate({ boxWidth: 0, boxHeight: 500, ...landscape }), false, "nothing measured, nothing turned");
});

test("a turned map swaps the width and height it takes up", async () => {
  const { mapLayout } = await load();
  assert.deepEqual(mapLayout({ boxWidth: 350, boxHeight: 500, imageWidth: 400, imageHeight: 300, rotate: true }), { rotate: true, width: 466.6666666666667, height: 350, stageHeight: 466.6666666666667 });
  assert.deepEqual(mapLayout({ boxWidth: 800, boxHeight: 500, imageWidth: 400, imageHeight: 300, rotate: false }), { rotate: false, width: 400 * (500 / 300), height: 500, stageHeight: 500 });
});

test("the decision stands until the box changes by more than 10 %", async () => {
  const { changedEnough } = await load();
  assert.equal(changedEnough(null, { boxWidth: 350, boxHeight: 500 }), true);
  assert.equal(changedEnough({ boxWidth: 350, boxHeight: 500 }, { boxWidth: 370, boxHeight: 520 }), false);
  assert.equal(changedEnough({ boxWidth: 350, boxHeight: 500 }, { boxWidth: 400, boxHeight: 500 }), true);
});

test("a loaded map in its stage is laid out turned or upright; a stage that may not turn stays upright", async () => {
  const { placeMaps } = await load();
  const { window } = new JSDOM('<!doctype html><div id="root"><div data-map-stage data-rotation="auto"><img src="a.png"></div><div data-map-stage data-rotation="none"><img src="b.png"></div></div>');
  const root = window.document.getElementById("root");
  for (const stage of root.querySelectorAll("[data-map-stage]")) Object.defineProperty(stage, "clientWidth", { value: 350 });
  for (const img of root.querySelectorAll("img")) {
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });
  }
  // A box of 350 × 490 px: turned, the map is 467 px wide and 350 px tall, and so is its stage.
  placeMaps(root, { viewportHeight: 700 });
  const [turned, upright] = root.querySelectorAll("[data-map-stage]");
  const image = turned.querySelector("img");
  assert.deepEqual([turned.dataset.rotated, turned.style.height, image.style.width, image.style.height], ["true", "467px", "467px", "350px"]);
  assert.match(image.style.transform, /rotate\(90deg\)/);
  assert.equal(upright.dataset.rotated, "false");
  assert.equal(upright.querySelector("img").style.transform, "");
});

// In a robot's card the map takes its column up to a fixed height, so a tall map on
// a wide card turns instead of standing narrow beside empty space.
test("a stage with a fixed height measures against it rather than the viewport", async () => {
  const { placeMaps } = await load();
  const { window } = new JSDOM('<!doctype html><div id="root"><div data-map-stage data-rotation="auto" data-max-height="260"><img src="tall.png"></div></div>');
  const root = window.document.getElementById("root");
  const stage = root.querySelector("[data-map-stage]");
  Object.defineProperty(stage, "clientWidth", { value: 500 });
  const img = stage.querySelector("img");
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: 300 });
  Object.defineProperty(img, "naturalHeight", { value: 400 });
  // Upright it would be 195 × 260 px; turned it is 347 px wide and 260 px tall.
  placeMaps(root, { viewportHeight: 900 });
  assert.deepEqual([stage.dataset.rotated, stage.style.height, img.style.width, img.style.height], ["true", "260px", "260px", "347px"]);
});
