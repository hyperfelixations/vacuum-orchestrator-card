// The integration's setup status (`get_setup`): the facts of each assistant step and whether the
// assistant is still pending. No step is mandatory and the card computes none of them. See
// internal dev doc §7 "Einrichtungsstatus".

import { SETUP_STEPS } from "./job-schema.js";
import { finite, instant, isRecord, strings } from "./wire-values.js";

export function normalizeSetup(wire) {
  if (!isRecord(wire) || !isRecord(wire.steps)) return null;
  const steps = wire.steps;
  const step = (name) => (isRecord(steps[name]) ? steps[name] : {});
  return Object.freeze({
    assistantPending: wire.assistant_pending === true,
    completedAt: instant(wire.completed_at),
    // Whether the integration lets this user command it; Home Assistant's read-only users not.
    mayCommand: wire.permissions?.command !== false,
    steps: Object.freeze({
      robots: Object.freeze({ robotIds: strings(step("robots").robot_ids) }),
      rooms: Object.freeze({ roomIds: strings(step("rooms").room_ids), unreachableRoomIds: strings(step("rooms").unreachable_room_ids) }),
      defaults: Object.freeze({ configured: step("defaults").configured === true }),
      queue: Object.freeze({ graceSeconds: finite(step("queue").grace_seconds), startDelaySeconds: finite(step("queue").start_delay_seconds) }),
    }),
  });
}

export { SETUP_STEPS };
