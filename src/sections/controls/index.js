// Stable control registry used by the editor; each entry satisfies the shared render/patch/focus port.

import { chipSelect } from "./chip-select.js";
import { entityCombobox } from "./entity-combobox.js";
export { filterEntityOptions } from "./entity-combobox.js";
import { formField } from "./form-field.js";
import { segmented } from "./segmented.js";
import { stepper } from "./stepper.js";
import { switchControl } from "./switch.js";
import { textField } from "./text-field.js";
export { handleControlKeydown } from "./keyboard.js";

export const CONTROL_REGISTRY = Object.freeze({
  segmented,
  "chip-select": chipSelect,
  stepper,
  "text-field": textField,
  "entity-combobox": entityCombobox,
  switch: switchControl,
  "form-field": formField,
});

export function controlFor(kind) {
  return CONTROL_REGISTRY[kind] || textField;
}
