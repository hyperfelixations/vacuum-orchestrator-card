// What the card reads from Home Assistant's frontend object, as plain facts for the model:
// entity states, areas, the user's admin flag, the integration's registered actions and Home
// Assistant's own state formatter. Home Assistant's objects are passed on, never copied or frozen.

import { registeredOperations } from "./session.js";

export function readHomeAssistant(hass) {
  return {
    states: hass?.states || null,
    areas: hass?.areas || null,
    admin: typeof hass?.user?.is_admin === "boolean" ? hass.user.is_admin : null,
    operations: [...registeredOperations(hass)].sort(),
    formatState: typeof hass?.formatEntityState === "function" ? (state) => hass.formatEntityState(state) : null,
  };
}
