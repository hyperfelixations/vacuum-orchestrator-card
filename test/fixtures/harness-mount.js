// Plays a recording of the integration (internal dev doc §10) and mounts cards on the harness
// stage. Browser tests call `window.vocHarness.mount(...)`.
(function () {
  "use strict";

  // The cards follow a recording opened at the mark `from` (else its first); the page clock reads
  // its time and every recorded change hands the cards a new hass, as Home Assistant does.
  async function replay(options, cards) {
    const response = await fetch(`voi/recordings/${options.recording}.json`);
    if (!response.ok) throw new Error(`no recording ${options.recording}`);
    const recording = await response.json();
    const from = options.from ?? recording.steps.find((step) => step.mark !== undefined)?.mark;
    const clock = { advance: (ms) => (window.__vocNow += ms) };
    const backend = window.VocRecorded.createRecordedBackend(recording, { from, language: options.language || "en", admin: options.admin, clock });
    for (const [match, error] of options.failNext || []) backend.failNext(match, error);
    window.__vocNow = backend.nowMs;
    backend.onChange((hass) => {
      window.vocHarness.hass = hass;
      for (const card of cards) card.hass = hass;
    });
    return backend;
  }

  // options: recording, from (see replay), config, width, language, admin (overrides the recorded
  // user's flag), failNext ([match, error] pairs Home Assistant refuses), count (cards side by
  // side), configs (one config per card), themes ("light" or "dark" per card, each card on its
  // own themed panel), layout ("grid": a sections grid cell rows·64−8 px high as in
  // `hui-grid-section`, rows from `rows` or the card's default; "panel": a block 800 px high).
  async function mount(options = {}) {
    if (!options.recording) throw new Error("mount needs a recording of the integration");
    const cardsOnStage = [];
    const backend = await replay(options, cardsOnStage);
    const { hass } = backend;
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
    cardsOnStage.push(...cards);
    window.vocHarness.backend = backend;
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
