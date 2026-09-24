export function createActionRuntime({ platform, getActions = () => ({}), dispatch = () => {} } = {}) {
  return {
    fire(actionName = "tap") {
      const config = getActions()?.[`${actionName}_action`] || getActions()?.tap_action;
      if (!config || config.action === "none") return;
      const event = platform.createEvent("hass-action", { bubbles: true, composed: true });
      event.detail = { config, action: actionName };
      dispatch(event);
    },
  };
}
