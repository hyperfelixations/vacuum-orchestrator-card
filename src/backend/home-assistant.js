// What the card reads from Home Assistant's frontend object, as plain facts for the model:
// entity states, areas, the user's admin flag, the operations the integration offers (its
// registered actions, and its card commands while it is loaded) and Home Assistant's own state
// formatter. Home Assistant's objects are passed on, never copied or frozen.

import { CARD_COMMANDS } from "./protocol.js";
import { componentLoaded, registeredOperations } from "./session.js";

// The parts besides entity states the card reads; Home Assistant replaces a part when it changes
// and keeps the state object of an entity that did not (internal dev doc "Renderanlässe").
const HASS_PARTS = Object.freeze(["areas", "entities", "devices", "floors", "user", "locale", "language", "themes", "services", "config", "connection", "formatEntityState", "formatEntityName", "hassUrl"]);

// Whether `next` differs from `previous` in anything a card that read `watched` shows:
// `watched.entityIds`, or every state while `watched.allStates`.
export function hassChanged(previous, next, watched) {
  if (!previous || !next || !watched) return true;
  if (HASS_PARTS.some((part) => previous[part] !== next[part])) return true;
  if (previous.states === next.states) return false;
  if (watched.allStates) return true;
  return watched.entityIds.some((entityId) => previous.states?.[entityId] !== next.states?.[entityId]);
}

export function readHomeAssistant(hass) {
  return {
    states: hass?.states || null,
    areas: hass?.areas || null,
    admin: typeof hass?.user?.is_admin === "boolean" ? hass.user.is_admin : null,
    operations: [...registeredOperations(hass), ...(componentLoaded(hass) ? CARD_COMMANDS : [])].sort(),
    // Home Assistant's wording of a state object's state, or of another value of that entity.
    formatState: typeof hass?.formatEntityState === "function" ? (state, value) => (value === undefined ? hass.formatEntityState(state) : hass.formatEntityState(state, value)) : null,
    // Home Assistant's name of an entity as its own cards show it: its device's and its own.
    formatName: typeof hass?.formatEntityName === "function" ? (state) => hass.formatEntityName(state) : null,
  };
}
