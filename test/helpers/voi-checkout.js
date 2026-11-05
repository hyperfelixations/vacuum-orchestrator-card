"use strict";
// Where the integration's checkout lies when neither `--from` nor `VOI_CHECKOUT` names one: the
// copy CI checks out at test/voi-ref (`.voi-checkout`, ignored by Git) once it exists, else the
// integration's repository next to the card (internal dev doc §10).

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

function defaultVoiCheckout(root = ROOT) {
  const pinned = path.join(root, ".voi-checkout");
  return fs.existsSync(path.join(pinned, "tests", "contract", "__main__.py")) ? pinned : path.resolve(root, "..", "vacuum-orchestrator");
}

module.exports = { defaultVoiCheckout };
