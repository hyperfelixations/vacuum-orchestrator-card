"use strict";
// Keyboard operation of the card's own controls, driven through the real markup the controls
// render. Boundary: the delegation module and the control markup together; the card's own
// keydown listener is a component concern.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

async function textContext(language = "en") {
  const i18n = await import("../../../src/i18n/translate.js");
  return { language, t: (key, vars) => i18n.translate(language, key, vars) };
}

// Renders one control into a document and returns the pieces a keyboard test needs.
async function mountControl(kind, field) {
  const { CONTROL_REGISTRY } = await import("../../../src/sections/controls/index.js");
  const { handleControlKeydown } = await import("../../../src/sections/controls/keyboard.js");
  const texts = await textContext();
  const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>");
  const root = dom.window.document.getElementById("root");
  root.innerHTML = CONTROL_REGISTRY[kind].render({ texts, icons: {} }, field);
  const clicks = [];
  root.addEventListener("click", (event) => clicks.push(event.target));
  const press = (target, key) => {
    const event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: target });
    return { handled: handleControlKeydown(event), event };
  };
  return { dom, root, press, clicks, active: () => dom.window.document.activeElement };
}

test("a key outside any control is not claimed", async () => {
  const { root, press } = await mountControl("segmented", {
    path: "mode",
    label: "Mode",
    value: "vacuum",
    options: [{ value: "vacuum", label: "Vacuum" }],
  });
  assert.equal(press(root.ownerDocument.body, "ArrowRight").handled, false);
});

test("a single choice moves and selects with the arrow keys, Home and End", async () => {
  const { root, press, clicks } = await mountControl("segmented", {
    path: "mode",
    label: "Mode",
    value: "vacuum",
    options: [
      { value: "vacuum", label: "Vacuum" },
      { value: "mop", label: "Mop" },
      { value: "vacuum_and_mop", label: "Vacuum and mop" },
    ],
  });
  const buttons = [...root.querySelectorAll('[role="radio"]')];

  assert.equal(press(buttons[0], "ArrowRight").handled, true);
  assert.equal(clicks.at(-1), buttons[1], "moving the selection also chooses the option");

  assert.equal(press(buttons[1], "ArrowLeft").handled, true);
  assert.equal(clicks.at(-1), buttons[0]);

  assert.equal(press(buttons[0], "End").handled, true);
  assert.equal(clicks.at(-1), buttons[2]);

  assert.equal(press(buttons[2], "Home").handled, true);
  assert.equal(clicks.at(-1), buttons[0]);

  // The ends wrap, so the selection never gets stuck. `End` leaves the focus on the last
  // option, which is where the next step counts from.
  assert.equal(press(buttons[0], "End").handled, true);
  assert.equal(press(buttons[2], "ArrowRight").handled, true);
  assert.equal(clicks.at(-1), buttons[0]);

  assert.equal(press(buttons[0], "Enter").handled, false, "Enter is the browser's own activation");
});

test("a multiple choice answers the same keys", async () => {
  const { root, press, clicks } = await mountControl("chip-select", {
    path: "areas",
    label: "Rooms",
    value: ["kitchen"],
    options: [
      { value: "kitchen", label: "Kitchen" },
      { value: "hall", label: "Hall" },
    ],
  });
  const options = [...root.querySelectorAll('[role="option"]')];
  assert.equal(press(options[0], "ArrowDown").handled, true);
  assert.equal(clicks.at(-1), options[1]);
});

test("the stepper steps with the arrow and page keys and jumps to its bounds", async () => {
  const { root, press, clicks } = await mountControl("stepper", { path: "passes", label: "Passes", min: 1, max: 10, value: 4 });
  const input = root.querySelector("input");
  const decrement = root.querySelector('[data-stepper-action="decrement"]');
  const increment = root.querySelector('[data-stepper-action="increment"]');

  assert.equal(press(input, "ArrowUp").handled, true);
  assert.equal(clicks.at(-1), increment);
  assert.equal(press(input, "PageUp").handled, true);
  assert.equal(clicks.at(-1), increment);
  assert.equal(press(input, "ArrowDown").handled, true);
  assert.equal(clicks.at(-1), decrement);
  assert.equal(press(input, "PageDown").handled, true);
  assert.equal(clicks.at(-1), decrement);

  // Home and End are bounds, not steps: they set the value and report it as an input.
  const inputs = [];
  input.addEventListener("input", () => inputs.push(input.value));
  assert.equal(press(input, "End").handled, true);
  assert.equal(input.value, "10");
  assert.equal(press(input, "Home").handled, true);
  assert.equal(input.value, "1");
  assert.deepEqual(inputs, ["10", "1"]);

  assert.equal(press(input, "ArrowRight").handled, false, "a caret key belongs to the field");
});

test("the entity combobox walks its list, marks the active option and closes with Escape", async () => {
  const { root, press, clicks } = await mountControl("entity-combobox", {
    path: "requiredOn",
    label: "Required on",
    value: [],
    options: [
      { value: "binary_sensor.door", label: "Door" },
      { value: "input_boolean.allowed", label: "Allowed" },
    ],
  });
  const control = root.querySelector('[data-control="entity-combobox"]');
  const input = root.querySelector('[role="combobox"]');
  const list = root.querySelector(".voc-combobox-list");
  const options = [...root.querySelectorAll('[role="option"]')];
  for (const option of options) option.hidden = false;

  assert.equal(press(input, "ArrowDown").handled, true);
  assert.equal(input.getAttribute("aria-activedescendant"), options[1].id);
  assert.equal(clicks.length, 0, "walking the list does not choose anything");

  assert.equal(press(input, "Home").handled, true);
  assert.equal(input.getAttribute("aria-activedescendant"), options[0].id);

  assert.equal(press(input, "Enter").handled, true);
  assert.equal(clicks.at(-1)?.getAttribute("role"), "option", "Enter takes the active option");

  assert.equal(press(input, "Escape").handled, true);
  assert.equal(list.hidden, true);
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(control.getAttribute("aria-expanded"), "false");
  assert.equal(input.hasAttribute("aria-activedescendant"), false);
});

test("the option list narrows to what was typed without touching the draft", async () => {
  const { filterEntityOptions } = await import("../../../src/sections/controls/entity-combobox.js");
  const { root } = await mountControl("entity-combobox", {
    path: "requiredOff",
    label: "Required off",
    value: [],
    options: [
      { value: "binary_sensor.door", label: "Door" },
      { value: "binary_sensor.window", label: "Window" },
    ],
  });
  const control = root.querySelector('[data-control="entity-combobox"]');
  const list = control.querySelector(".voc-combobox-list");
  assert.equal(filterEntityOptions(control, "win"), 1);
  assert.equal(list.hidden, false);
  assert.equal(filterEntityOptions(control, "nothing matches this"), 0);
  assert.equal(list.hidden, true, "a query nothing matches leaves no list open");
  // An empty query is not "show everything": the list belongs to typing.
  assert.equal(filterEntityOptions(control, ""), 0);
  assert.equal(control.getAttribute("aria-expanded"), "false");
  assert.equal(filterEntityOptions(null, "win"), 0);
});
