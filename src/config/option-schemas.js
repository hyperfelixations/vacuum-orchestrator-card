export function boolOption(defaultValue) {
  return Object.freeze({ default: defaultValue, validate: (value) => typeof value === "boolean" });
}

export function enumOption(defaultValue, allowedValues) {
  return Object.freeze({ default: defaultValue, validate: (value) => allowedValues.includes(value) });
}

export function numberOption(defaultValue, { min = -Infinity, max = Infinity, integer = false } = {}) {
  return Object.freeze({
    default: defaultValue,
    validate: (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)),
  });
}
