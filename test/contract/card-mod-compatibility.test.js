// The promise card-mod relies on: nodes the card did not create are never touched, in the
// shadow root or inside ha-card, across renders of the assembled card.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../helpers/mount-card.js");

test("foreign nodes in the shadow root and in ha-card survive every render", async () => {
  const card = await mountCard({ recording: "showcase", from: "A busy afternoon" });
  const cardMod = card.env.document.createElement("card-mod");
  card.root.appendChild(cardMod);
  const style = card.env.document.createElement("style");
  style.textContent = ".voc-title { color: red; }";
  card.root.querySelector("ha-card").appendChild(style);
  await card.click('[role="tab"][data-view="rooms"]');
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", title: "Changed" });
  await card.settle();
  assert.equal(card.root.querySelector("card-mod"), cardMod);
  assert.equal(card.root.querySelector("ha-card > style"), style);
  assert.equal(card.root.querySelectorAll("ha-card").length, 1);
  assert.deepEqual(card.card.config, { type: "custom:vacuum-orchestrator-card", title: "Changed" });
  card.unmount();
});
