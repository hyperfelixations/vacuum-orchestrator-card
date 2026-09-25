// The card's own controls in a real engine: roving selection and keyboard operation.
// Boundary: pointer and key handling; the resulting draft is a component-level concern.

const { test, expect } = require("../../helpers/playwright.js");

test("card-owned controls expose roving selection and keyboard actions", async ({ page }) => {
  await page.goto("/test/fixtures/harness.html");
  const result = await page.evaluate(async () => {
    const [{ segmented }, { stepper }, { entityCombobox }, { handleControlKeydown }] = await Promise.all([
      import("/src/sections/controls/segmented.js"),
      import("/src/sections/controls/stepper.js"),
      import("/src/sections/controls/entity-combobox.js"),
      import("/src/sections/controls/keyboard.js"),
    ]);
    const texts = { t: (key) => key };
    document.addEventListener("keydown", handleControlKeydown);
    document.body.innerHTML = segmented.render({ texts }, { path: "mode", label: "Mode", value: "vacuum", options: [{ value: "vacuum", label: "Vacuum" }, { value: "mop", label: "Mop" }] });
    const options = [...document.querySelectorAll("[role=radio]")];
    let selectedByKey = 0;
    options[1].addEventListener("click", () => { selectedByKey += 1; });
    options[0].focus();
    options[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const segmentedResult = { focus: document.activeElement?.dataset.vocValue, selectedByKey, firstTabIndex: options[0].tabIndex, secondTabIndex: options[1].tabIndex };

    document.body.innerHTML = stepper.render({ texts }, { path: "passes", label: "Passes", min: 1, max: 10, value: 2 });
    const stepperRoot = document.querySelector("[data-control=stepper]");
    const increment = stepperRoot.querySelector("[data-stepper-action=increment]");
    let incremented = 0;
    increment.addEventListener("click", () => { incremented += 1; });
    const input = stepperRoot.querySelector("input");
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
    const stepperResult = { incremented, inputFocusedAfterKey: document.activeElement === input };

    document.body.innerHTML = entityCombobox.render({ texts }, { path: "requiredOn", label: "Required on", expanded: true, activeDescendant: "voc-field-requiredOn-option-0", options: [{ value: "input_boolean.allowed", label: "Allowed" }], value: [] });
    const combobox = document.querySelector("[role=combobox]");
    combobox.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const list = document.querySelector(".voc-combobox-list");
    const comboboxResult = { expanded: combobox.getAttribute("aria-expanded"), hidden: list.hidden, active: combobox.getAttribute("aria-activedescendant") };
    document.removeEventListener("keydown", handleControlKeydown);
    return { segmentedResult, stepperResult, comboboxResult };
  });

  expect(result.segmentedResult).toEqual({ focus: "mop", selectedByKey: 1, firstTabIndex: 0, secondTabIndex: -1 });
  expect(result.stepperResult).toEqual({ incremented: 1, inputFocusedAfterKey: true });
  expect(result.comboboxResult).toEqual({ expanded: "false", hidden: true, active: null });
});
