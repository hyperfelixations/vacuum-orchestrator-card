// What the card reads from Home Assistant's frontend object, as plain facts for the model:
// entity states, areas, the user's admin flag, the operations the integration offers (its
// registered actions, and its card commands while it is loaded) and Home Assistant's own state
// formatter. Home Assistant's objects are passed on, never copied or frozen.

import { CARD_COMMANDS } from "./protocol.js";
import { componentLoaded, registeredOperations } from "./session.js";

export function readHomeAssistant(hass) {
  return {
    states: hass?.states || null,
    areas: hass?.areas || null,
    admin: typeof hass?.user?.is_admin === "boolean" ? hass.user.is_admin : null,
    operations: [...registeredOperations(hass), ...(componentLoaded(hass) ? CARD_COMMANDS : [])].sort(),
    formatState: typeof hass?.formatEntityState === "function" ? (state) => hass.formatEntityState(state) : null,
  };
}
