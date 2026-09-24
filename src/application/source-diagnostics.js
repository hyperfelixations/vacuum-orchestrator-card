// Turns backend facts into the card's two notice levels. A warning names something the user
// can act on; a hint qualifies a card that is otherwise working.
//
// Deliberately NOT warnings: a missing optional capability and a read-only user. Both are
// normal states that the affected section and the status pill already explain, and a warning
// block that is always on stops being a warning. See internal dev doc §7 "Diagnosequellen".

import { SEVERITY, createDiagnostic } from "../core/diagnostics.js";

export function collectBackendDiagnostics({ model, backendDiagnostics = [] } = {}) {
  const warnings = [];
  const hints = [];
  const seen = new Set();

  const add = (diagnostic) => {
    const key = `${diagnostic.code}:${JSON.stringify(diagnostic.params ?? null)}`;
    if (seen.has(key)) return;
    seen.add(key);
    (diagnostic.severity === SEVERITY.WARNING ? warnings : hints).push(diagnostic);
  };

  for (const diagnostic of backendDiagnostics) {
    if (diagnostic?.code && diagnostic.severity) add(diagnostic);
  }

  if (model?.connection?.stale) add(createDiagnostic("hint.stale_snapshot"));
  if (model?.commands?.pending?.length) add(createDiagnostic("hint.command_pending"));
  if (model?.queue?.available && model.queue.total > model.queue.pending.length) {
    add(createDiagnostic("hint.partial_page", { params: { total: model.queue.total, shown: model.queue.pending.length } }));
  }

  return Object.freeze({ warnings: Object.freeze(warnings), hints: Object.freeze(hints) });
}
