// The setup checklist, read from integration facts: is a robot profile configured, does a robot
// reach a room, is a room released, is there a job. Each step only reports what the integration
// already says; none of them predicts whether cleaning will start.
// See internal dev doc §7 "Einrichtungsstatus".

import { reachableRoomIds } from "../domain/robots.js";

export const SETUP_STEPS = Object.freeze(["robots", "rooms", "release", "firstJob"]);
// Steps without which the integration cannot clean at all.
export const REQUIRED_STEPS = Object.freeze(["robots", "rooms"]);

export function coveredRoomIds(robots) {
  const covered = new Set();
  for (const robot of robots || []) for (const roomId of reachableRoomIds(robot)) covered.add(roomId);
  return covered;
}

// `known` is false while a fact has not been loaded; the checklist then stays undecided
// instead of claiming an incomplete setup.
export function setupStatus({ robots = null, rooms = null, queueTotal = null, openJobs = null } = {}) {
  const usableRooms = rooms ? rooms.filter((room) => room.enabled && !room.areaMissing) : null;
  const covered = robots ? coveredRoomIds(robots) : null;
  const steps = {
    robots: { known: robots !== null, done: Boolean(robots?.length), count: robots?.length ?? 0 },
    rooms: {
      known: robots !== null && rooms !== null,
      done: Boolean(usableRooms?.some((room) => covered?.has(room.roomId))),
      count: usableRooms?.filter((room) => covered?.has(room.roomId)).length ?? 0,
      uncovered: Object.freeze(usableRooms?.filter((room) => !covered?.has(room.roomId)).map((room) => room.roomId) ?? []),
    },
    release: { known: rooms !== null, done: Boolean(usableRooms?.some((room) => room.released || room.release)), count: usableRooms?.filter((room) => room.released).length ?? 0 },
    firstJob: { known: queueTotal !== null, done: (queueTotal ?? 0) > 0 || (openJobs?.length ?? 0) > 0, count: queueTotal ?? 0 },
  };
  const known = REQUIRED_STEPS.every((step) => steps[step].known);
  const complete = known && REQUIRED_STEPS.every((step) => steps[step].done);
  const next = known ? SETUP_STEPS.find((step) => steps[step].known && !steps[step].done) ?? null : null;
  return Object.freeze({ known, complete, next, steps: Object.freeze(Object.fromEntries(Object.entries(steps).map(([key, value]) => [key, Object.freeze(value)]))) });
}
