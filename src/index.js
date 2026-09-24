import { CARD_NAME, CARD_TYPE, CARD_VERSION, CARD_VERSION_GLOBAL } from "./core/card-metadata.js";
import { VacuumOrchestratorCard } from "./element/vacuum-orchestrator-card.js";

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, VacuumOrchestratorCard);

window.customCards = window.customCards || [];
const metadata = {
  type: CARD_TYPE,
  name: CARD_NAME,
  preview: true,
  description: "Queue and job controls for the Home Assistant Vacuum Orchestrator integration.",
  documentationURL: "https://github.com/hyperfelixations/vacuum-orchestrator-card",
};
const existing = window.customCards.find((entry) => entry.type === CARD_TYPE);
if (existing) Object.assign(existing, metadata);
else window.customCards.push(metadata);
window[CARD_VERSION_GLOBAL] = CARD_VERSION;
