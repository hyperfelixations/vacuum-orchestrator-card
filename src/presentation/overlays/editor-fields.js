// Field view models shared by the editors: labels, hints, the integration's error for a field
// after an attempt to send, and entity search results. Option lists come from the integration's
// vocabularies; nothing here judges whether a robot can execute a choice or a value is valid.

import { failureText, t } from "../common/texts.js";
import { entityName } from "../common/lookups.js";

export const ENTITY_MATCH_LIMIT = 8;

// An error code of the integration in its own words.
export function errorText(texts, code) {
  return code ? failureText(texts, { code }) : null;
}

// The errors a page keeps from the integration's last verdict (`errors` by field key,
// `formError` for the input as a whole): the text for a field, the first text below a key, and
// the notice above the form.
export function pageErrors(texts, overlay) {
  const errors = overlay?.errors ?? {};
  const keys = Object.keys(errors);
  return {
    errors,
    error: (key) => errorText(texts, errors[key]),
    within: (prefix) => errorText(texts, errors[keys.find((key) => key === prefix || key.startsWith(`${prefix}.`))]),
    any: (prefix) => keys.some((key) => key === prefix || key.startsWith(`${prefix}.`)),
    invalid: overlay?.formError ? errorText(texts, overlay.formError) : keys.length ? t(texts, "editor.fixErrors") : null,
  };
}

export function field(texts, { key, labelKey, labelVars = undefined, control, value, options = [], hintKey = null, hint = null, error = null, optional = false, ...extra }) {
  return {
    key,
    label: t(texts, labelKey, labelVars),
    control,
    value,
    options,
    hint: hint ?? (hintKey ? t(texts, hintKey) : null),
    error,
    optionalLabel: optional ? t(texts, "field.optional") : null,
    ...extra,
  };
}

// The entity catalog filtered by the field's query, without the entities already chosen.
export function entityField(texts, model, { key, labelKey, labelVars = undefined, value, query = "", domains = null, error = null, hintKey = null, optional = true }) {
  const chosen = new Set(value || []);
  const needle = String(query || "").trim().toLowerCase();
  const matches = needle
    ? model.entityCatalog
        .filter((entry) => !chosen.has(entry.entityId) && (!domains || domains.includes(entry.domain)) && `${entry.name} ${entry.entityId}`.toLowerCase().includes(needle))
        .slice(0, ENTITY_MATCH_LIMIT)
        .map((entry) => ({ value: entry.entityId, label: entry.name }))
    : [];
  return field(texts, {
    key,
    labelKey,
    labelVars,
    control: "entities",
    value: (value || []).map((entityId) => ({ value: entityId, label: entityName(entityId, model) })),
    queryKey: `query:${key}`,
    query,
    matches,
    error,
    hintKey,
    optional,
  });
}
