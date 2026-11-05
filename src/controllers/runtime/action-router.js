// Every control's `data-action` ends here and becomes UI navigation or one integration command.
// Destructive commands pass through a confirmation dialog unless `confirm_destructive: false`.
// The router decides nothing about domain rules: the integration checks every form's input
// (`validate`) and answers every command; a refusal becomes this card's notice, or the dialog's
// own message. A command belongs to the page or dialog it was sent from, which waits for the
// answer. The actions live in `actions/` by flow; this composes them. See internal dev doc §9
// "Aktionsvertrag" and "Command-Lebenszyklus".

import { own } from "../../core/lookup.js";
import { createEditing, editingActions } from "./actions/editing.js";
import { createHolds } from "./actions/holds.js";
import { jobActions } from "./actions/jobs.js";
import { createLifecycle, lifecycleActions } from "./actions/lifecycle.js";
import { navigationActions } from "./actions/navigation.js";
import { queueActions } from "./actions/queue.js";
import { robotActions } from "./actions/robots.js";
import { roomActions } from "./actions/rooms.js";
import { templateActions } from "./actions/templates.js";

// Each module turns the router's context into its handlers.
export const ACTION_MODULES = Object.freeze([lifecycleActions, editingActions, navigationActions, jobActions, queueActions, roomActions, robotActions, templateActions]);

// What a person can still do while the page or dialog on top waits for its command's answer.
const WHILE_BUSY = new Set(["dismiss-notice", "navigate"]);

// One handler per action; an action two modules claim is a mistake of the card.
export function composeHandlers(maps) {
  const handlers = {};
  for (const map of maps) {
    for (const [action, handler] of Object.entries(map)) {
      if (Object.hasOwn(handlers, action)) throw new Error(`action-router: "${action}" is handled twice`);
      handlers[action] = handler;
    }
  }
  return Object.freeze(handlers);
}

// `isDialog(kind)`: whether an overlay is a card dialog, which shows a failure itself.
// `getView`: the view on screen, which the tab row resolves when the card has not chosen one.
export function createActionRouter({ ui, getSession, getModel, getConfig, platform, isDialog = () => false, getView = () => ui.snapshot.view }) {
  const ports = { ui, getSession, getModel, getConfig, platform, isDialog, getView };
  const holds = createHolds(ports);
  const lifecycle = createLifecycle(ports);
  const editing = createEditing(ports);
  const handlers = composeHandlers(ACTION_MODULES.map((actions) => actions({ ...ports, holds, lifecycle, editing })));

  return {
    pauseHolds: holds.pause,
    resumeHolds: holds.resume,
    handle(action, args = {}) {
      const handler = own(handlers, action);
      if (!handler || (ui.overlay?.busy && !WHILE_BUSY.has(action))) return undefined;
      // Choosing anything, a menu item included, closes an open menu.
      if (action !== "toggle-menu" && ui.snapshot.menu) ui.setMenu(null);
      return handler(args);
    },
    // Text and number fields report through input events, not actions.
    input: (field, value) => {
      if (!ui.overlay?.busy) editing.setValue(field, value);
    },
    has: (action) => Object.hasOwn(handlers, action),
  };
}
