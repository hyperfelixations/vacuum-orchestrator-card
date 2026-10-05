// Builds a Home Assistant `hass` object for a named scenario, attaches the fake integration and
// mounts cards on the harness stage. Browser tests call `window.vocHarness.mount(...)`.
(function () {
  "use strict";

  const { createFakeOrchestrator } = window.VocFake;
  const { SCENARIOS, hassFor } = window.VocScenarios;

  // options: scenario, config, width, language, admin, installed, setUp, runtimeLoaded,
  // apiVersion, count (cards side by side), configs (one config per card), themes ("light" or
  // "dark" per card, each card on its own themed panel).
  async function mount(options = {}) {
    const household = (SCENARIOS[options.scenario || "typical"] || SCENARIOS.typical)();
    const fake = createFakeOrchestrator({ seed: household.seed, admin: options.admin !== false, installed: options.installed !== false, setUp: options.setUp !== false, runtimeLoaded: options.runtimeLoaded !== false, apiVersion: options.apiVersion ?? 2 });
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
      const theme = options.themes?.[index];
      if (theme) {
        const panel = document.createElement("div");
        panel.className = `voc-theme voc-theme-${theme}`;
        panel.appendChild(card);
        stage.appendChild(panel);
      } else {
        stage.appendChild(card);
      }
      card.setConfig({ type: "custom:vacuum-orchestrator-card", ...config });
      card.hass = hass;
      return card;
    });
    window.vocHarness.fake = fake;
    window.vocHarness.hass = hass;
    window.vocHarness.cards = cards;
    await window.__vocIconsReady;
    return cards.length;
  }

  window.vocHarness = { mount };
})();
