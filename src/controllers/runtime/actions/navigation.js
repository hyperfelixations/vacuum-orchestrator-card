// Navigation: Home Assistant's pages and dialogs, the card's notice, views, menus, blocks that open
// and close, list pages and the setup guide. See internal dev doc §9 "Aktionsvertrag".

import { SETUP_TARGET } from "../../../domain/affordances.js";
import { menuId } from "../../../views/controls/menu.js";

export function navigationActions({ ui, getSession, getModel, getConfig, platform, lifecycle }) {
  const { run } = lifecycle;
  return {
    navigate: ({ path }) => platform.navigate?.(path),
    "dismiss-notice": () => ui.setNotice(null),
    reload: () => getSession()?.probe(),
    toggle: ({ key }) => ui.toggle(key),
    // A menu opens with focus on its first item (or its last, from ArrowUp) and closes with focus
    // back on its button (WAI-ARIA APG "Menu Button").
    "toggle-menu": ({ key, focus = "first" }) => {
      if (ui.snapshot.menu === key) {
        ui.requestFocus(`[data-key="menu:${key}"] .voc-menu-button`);
        ui.setMenu(null);
        return;
      }
      ui.requestFocus(`#${menuId(key)} [role="menuitem"]${focus === "last" ? ":last-of-type" : ""}`);
      ui.setMenu(key);
    },
    choose: ({ key, value }) => ui.choose(key, value),
    page: ({ scope, direction }) => {
      const data = getModel()?.slots?.[scope]?.data;
      const limit = data?.limit || getConfig()?.page_size || 25;
      const offset = data?.offset ?? 0;
      ui.setPage(scope, direction === "previous" ? offset - limit : offset + limit);
    },
    "open-more-info": ({ entityId }) => {
      if (entityId) platform.moreInfo?.(entityId);
    },
    "open-map": ({ robotId, entityId, rotation }) => ui.openOverlay({ kind: "robot-map", robotId, entityId, rotation: rotation === "none" ? "none" : "auto" }),
    "open-setup": () => ui.openOverlay({ kind: "setup-guide" }),
    // SET-09: once finished the card shows the queue, whose empty state offers the first job.
    "complete-setup": async () => {
      const guide = ui.overlay?.kind === "setup-guide";
      const result = await run("complete_setup", {}, { target: SETUP_TARGET, invalidates: ["setup"], closeOverlay: guide, success: { key: "notice.setupDone" } });
      if (result?.ok && !guide) ui.setView("queue");
      return result;
    },
    "defer-setup": () => {
      ui.deferSetup();
      ui.setView("queue");
    },
  };
}
