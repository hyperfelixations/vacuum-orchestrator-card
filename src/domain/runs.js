// Physical cleaning runs from the integration's history: its own and externally started ones.
// Empty or null values are no proof of a completed job. See internal dev doc §7 "Verlauf".

import { isCompletionQuality, isOperation, isRunSource } from "./job-schema.js";
import { enumerated, instant, isRecord, strings, text } from "./wire-values.js";

export function normalizeRun(wire) {
  if (!isRecord(wire)) return null;
  const runId = text(wire.run_id);
  if (!runId) return null;
  return Object.freeze({
    runId,
    source: enumerated(wire.source, isRunSource),
    operation: enumerated(wire.operation, isOperation),
    roomIds: strings(wire.room_ids),
    observedStart: instant(wire.observed_start),
    observedEnd: instant(wire.observed_end),
    quality: enumerated(wire.quality, isCompletionQuality),
    failureCode: text(wire.failure_code),
  });
}
