// Backend facts as the card's two notice levels (RCC diagnostics contract): a warning names
// something that keeps part of the card from working; a hint qualifies a card that works.
// Integration states such as a robot needing recovery are content of the views, not notices.

import { SEVERITY, createDiagnostic } from "../core/diagnostics.js";

const PHASE_CODES = new Set(["orchestrator_not_loaded", "orchestrator_not_initialized", "multiple_orchestrator_entries_loaded", "api_incompatible", "unknown_command"]);
const TRANSIENT_CODES = new Set(["connection_lost", "timeout"]);

export function collectSourceDiagnostics(model) {
  const warnings = [];
  const hints = [];
  const seen = new Set();
  const add = (diagnostic) => {
    const key = `${diagnostic.code}:${JSON.stringify(diagnostic.params)}`;
    if (seen.has(key)) return;
    seen.add(key);
    (diagnostic.severity === SEVERITY.WARNING ? warnings : hints).push(diagnostic);
  };
  if (model.phase !== "ready") return Object.freeze({ warnings: Object.freeze(warnings), hints: Object.freeze(hints) });

  let transient = false;
  for (const [slot, value] of Object.entries(model.slots)) {
    if (value.status !== "error" || !value.error) continue;
    if (TRANSIENT_CODES.has(value.error.code)) transient = true;
    else if (!PHASE_CODES.has(value.error.code)) add(createDiagnostic("backend.query_failed", { params: { scope: slot, code: value.error.code } }));
  }
  if (model.subscription === "reconnecting") add(createDiagnostic("hint.reconnecting"));
  else if (transient) add(createDiagnostic("hint.offline"));
  if (model.slots.openJobs?.data && model.slots.openJobs.data.complete === false) add(createDiagnostic("hint.partial_jobs"));
  return Object.freeze({ warnings: Object.freeze(warnings), hints: Object.freeze(hints) });
}
