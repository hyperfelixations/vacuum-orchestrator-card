// Field view models shared by the editors: labels, hints, the error for a field once the user
// tried to save, and entity search results. Option lists come from the integration's
// vocabularies; nothing here judges whether a robot can execute a choice.

import { t } from "../common/texts.js";
import { entityName } from "../common/lookups.js";

export const ENTITY_MATCH_LIMIT = 8;

export function errorText(texts, code) {
  return code ? t(texts, `validation.${code}`) : null;
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
