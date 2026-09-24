import { CARD_NAME } from "../../core/card-metadata.js";

export function createDiagnosticsReporter({ platform, describe = (value) => String(value) } = {}) {
  let lastWarnings = null;
  let lastFailure = null;
  return {
    reportWarnings(entries = []) {
      const lines = entries.map(describe);
      const key = JSON.stringify(lines);
      if (key === lastWarnings) return;
      lastWarnings = key;
      lines.forEach((line) => platform.log("warn", `${CARD_NAME}: ${line}`));
    },
    reportRenderFailure(error) {
      const key = `${error?.name || "Error"}:${error?.message || error}`;
      if (key === lastFailure) return;
      lastFailure = key;
      platform.log("error", `${CARD_NAME}: render failed`, error);
    },
    reportRenderSuccess() { lastFailure = null; },
  };
}
