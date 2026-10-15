// The integration's verdict on a form's input (`validate`): every field error with its path. The
// card checks nothing itself; it places each error at the field the path names. See internal dev
// doc §7 "Feldprüfung".

import { isRecord, records, text } from "./wire-values.js";

// `path`: the integration's keys and indexes joined with dots; "" is the input as a whole.
function fieldError(wire) {
  const code = text(wire.code);
  if (!code) return null;
  const path = Array.isArray(wire.path) ? wire.path.filter((part) => typeof part === "string" || Number.isInteger(part)).join(".") : "";
  return Object.freeze({ path, code });
}

// Null without a verdict.
export function normalizeValidation(wire) {
  if (!isRecord(wire) || typeof wire.valid !== "boolean") return null;
  const errors = Object.freeze(records(wire.errors).map(fieldError).filter(Boolean));
  return Object.freeze({ valid: wire.valid && errors.length === 0, errors });
}

// The errors a page shows: per field key the first error, and an error about the input as a whole
// for a path no field of the page names. `fieldOf(path)` gives the page's field key or null.
export function formErrors(validation, fieldOf) {
  const errors = {};
  let formError = null;
  for (const item of validation?.errors ?? []) {
    const key = item.path ? fieldOf(item.path) : null;
    if (key === null || key === undefined) formError ??= item.code;
    else if (!(key in errors)) errors[key] = item.code;
  }
  return Object.freeze({ errors: Object.freeze(errors), formError });
}

// The errors left once the field `key` changed: its own, and those of the item it belongs to or of
// the parts it holds (`requirements.0` for `requirements.0.acceptedStates` and the reverse).
export function withoutFieldError(errors, key) {
  if (!errors) return errors;
  const related = (name) => name === key || key.startsWith(`${name}.`) || name.startsWith(`${key}.`);
  const kept = Object.entries(errors).filter(([name]) => !related(name));
  return kept.length === Object.keys(errors).length ? errors : Object.freeze(Object.fromEntries(kept));
}
