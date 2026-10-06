// Builds a Home Assistant `hass` object for a named scenario, attaches the fake integration and
// mounts cards on the harness stage. Browser tests call `window.vocHarness.mount(...)`.
(function () {
  "use strict";

  const { createFakeOrchestrator } = window.VocFake;
  const { SCENARIOS, hassFor } = window.VocScenarios;

  // options: scenario, config, width, language, admin, installed, setUp, runtimeLoaded,
  // apiVersion, failNext (first error frame per message type or operation), count (cards side
  // by side), configs (one config per card), themes ("light" or "dark" per card, each card on
  // its own themed panel), layout ("grid": a sections grid cell rows·64−8 px high as in
  // `hui-grid-section`, rows from `rows` or the card's default; "panel": a block 800 px high).
  async function mount(options = {}) {
    const household = (SCENARIOS[options.scenario || "typical"] || SCENARIOS.typical)();
    const fake = createFakeOrchestrator({ seed: household.seed, admin: options.admin !== false, installed: options.installed !== false, setUp: options.setUp !== false, runtimeLoaded: options.runtimeLoaded !== false, apiVersion: options.apiVersion, failNext: options.failNext });
    const hass = fake.attachTo(hassFor(household, { language: options.language || "en", admin: options.admin !== false }));
    const stage = document.getElementById("stage");
    stage.innerHTML = "";
    stage.style.display = options.themes ? "inline-flex" : "flex";
    stage.style.alignItems = options.themes ? "stretch" : "flex-start";
    stage.style.padding = options.themes ? "0" : "";
    stage.style.gap = options.themes ? "0" : "16px";
    const configs = options.configs || Array.from({ length: options.themes?.length || options.count || 1 }, () => options.config || {});
    const cards = configs.map((config, index) => {
      const card = document.createElement("vacuum-orchestrator-card");
      card.style.width = `${options.width || 640}px`;
      const gridOptions = options.rows === undefined ? config.grid_options : { ...config.grid_options, rows: options.rows };
      const frame = layoutFrame(card, options.layout, gridOptions?.rows ?? card.getGridOptions().rows);
      const theme = options.themes?.[index];
      if (theme) {
        const panel = document.createElement("div");
        panel.className = `voc-theme voc-theme-${theme}`;
        panel.appendChild(frame);
        stage.appendChild(panel);
      } else {
        stage.appendChild(frame);
      }
      card.setConfig({ type: "custom:vacuum-orchestrator-card", ...config, ...(gridOptions ? { grid_options: gridOptions } : {}) });
      card.hass = hass;
      return card;
    });
    window.vocHarness.fake = fake;
    window.vocHarness.hass = hass;
    window.vocHarness.cards = cards;
    await window.__vocIconsReady;
    return cards.length;
  }

  // The card in the box Home Assistant gives it: a grid cell or a panel, or the card itself.
  function layoutFrame(card, layout, rows) {
    if (layout !== "grid" && layout !== "panel") return card;
    card.layout = layout;
    if (layout === "grid" && typeof rows !== "number") return card;
    const box = document.createElement("div");
    box.className = "voc-grid-cell";
    box.style.height = layout === "panel" ? "800px" : `${rows * 64 - 8}px`;
    box.appendChild(card);
    return box;
  }

  window.vocHarness = { mount };
})();
