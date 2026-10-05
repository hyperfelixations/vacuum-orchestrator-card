// The card picker's "by entity" suggestion: every vacuum and every entity of the integration
// offers the bare card, which sets itself up. Total over arbitrary frontend input.

import { CARD_TYPE } from "../core/card-metadata.js";
import { DOMAIN } from "../backend/transport.js";

const CONFIG_TYPE = `custom:${CARD_TYPE}`;
const VACUUM_PREFIX = "vacuum.";

function recordOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function entryOf(record, key) {
  return record && Object.hasOwn(record, key) ? recordOf(record[key]) : null;
}

export function suggestionForEntity(hass, entityId) {
  if (typeof entityId !== "string") return null;
  const source = recordOf(hass);
  const vacuum = entityId.startsWith(VACUUM_PREFIX) && Boolean(entryOf(recordOf(source?.states), entityId));
  const integration = entryOf(recordOf(source?.entities), entityId)?.platform === DOMAIN;
  return vacuum || integration ? { config: { type: CONFIG_TYPE } } : null;
}
