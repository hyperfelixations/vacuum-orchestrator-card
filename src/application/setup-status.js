// The setup checklist, read from integration facts: a robot profile, a room a robot reaches, the
// job defaults, conditions, a release, due rules, templates, the queue's wait time and a first
// job. Each step only reports what the integration already says; none of them predicts whether
// cleaning will start. See internal dev doc §7 "Einrichtungsstatus".

import { reachableRoomIds } from "../domain/robots.js";

export const SETUP_STEPS = Object.freeze(["robots", "rooms", "defaults", "conditions", "release", "due", "templates", "queue", "firstJob"]);
// Steps without which the integration cannot clean at all; every other step is optional.
export const REQUIRED_STEPS = Object.freeze(["robots", "rooms"]);

export function coveredRoomIds(robots) {
  const covered = new Set();
  for (const robot of robots || []) for (const roomId of reachableRoomIds(robot)) covered.add(roomId);
  return covered;
}

// `known` is false while a fact has not been loaded; the checklist then stays undecided
// instead of claiming an incomplete setup.
// The queue's wait time always has a value, so its step is done once it is read; the job
// defaults are done once saved, and until then the built-in ones apply (`builtIn`).
export function setupStatus({ robots = null, rooms = null, queueTotal = null, openJobs = null, jobDefaults = null, templates = null, graceSeconds = null } = {}) {
  const usableRooms = rooms ? rooms.filter((room) => room.enabled && !room.areaMissing) : null;
  const covered = robots ? coveredRoomIds(robots) : null;
  const conditions = (rooms ?? []).reduce((sum, room) => sum + (room.requirements?.length ?? 0), 0) + (robots ?? []).reduce((sum, robot) => sum + (robot.configuration?.requirements?.length ?? 0), 0);
  const dueRules = usableRooms?.filter((room) => [room.duePolicy?.vacuumSeconds, room.duePolicy?.mopSeconds, room.duePolicy?.occupancyEntityId].some((value) => value !== null && value !== undefined)).length ?? 0;
  const steps = {
    robots: { known: robots !== null, done: Boolean(robots?.length), count: robots?.length ?? 0 },
    rooms: {
      known: robots !== null && rooms !== null,
      done: Boolean(usableRooms?.some((room) => covered?.has(room.roomId))),
      count: usableRooms?.filter((room) => covered?.has(room.roomId)).length ?? 0,
      uncovered: Object.freeze(usableRooms?.filter((room) => !covered?.has(room.roomId)).map((room) => room.roomId) ?? []),
    },
    defaults: { known: jobDefaults !== null, done: jobDefaults?.configured === true, builtIn: jobDefaults !== null && jobDefaults.configured !== true },
    conditions: { known: robots !== null && rooms !== null, done: conditions > 0, count: conditions },
    release: { known: rooms !== null, done: Boolean(usableRooms?.some((room) => room.released || room.release)), count: usableRooms?.filter((room) => room.released).length ?? 0 },
    due: { known: rooms !== null, done: dueRules > 0, count: dueRules },
    templates: { known: templates !== null, done: Boolean(templates?.length), count: templates?.length ?? 0 },
    queue: { known: graceSeconds !== null, done: graceSeconds !== null, graceSeconds },
    firstJob: { known: queueTotal !== null, done: (queueTotal ?? 0) > 0 || (openJobs?.length ?? 0) > 0, count: queueTotal ?? 0 },
  };
  const known = REQUIRED_STEPS.every((step) => steps[step].known);
  const complete = known && REQUIRED_STEPS.every((step) => steps[step].done);
  const next = known ? SETUP_STEPS.find((step) => steps[step].known && !steps[step].done) ?? null : null;
  return Object.freeze({ known, complete, next, steps: Object.freeze(Object.fromEntries(Object.entries(steps).map(([key, value]) => [key, Object.freeze(value)]))) });
}
