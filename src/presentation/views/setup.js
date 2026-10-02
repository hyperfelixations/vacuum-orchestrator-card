// The setup assistant: the four setup steps in order, each with what the integration reports and
// the action that completes it. The current step is the first one not done; finished steps
// collapse to one line. See internal dev doc §8 "Einrichtung".

import { SETUP_STEPS } from "../../application/setup-status.js";
import { CREATE_TARGET, candidateAffordance, decide, roomAffordances } from "../../domain/affordances.js";
import { isConfiguredCandidate } from "../../domain/robots.js";
import { list, robotsOf, roomIndex, roomName, roomsOf, slotData } from "../common/lookups.js";
import { adapterLabel, number, t } from "../common/texts.js";

export const SETUP_ROOM_LIMIT = 6;

export function setupNeeded(model) {
  return model.setup?.known === true && model.setup.complete === false;
}

function robotsStep(model, texts, context) {
  const robots = robotsOf(model);
  const candidates = list(slotData(model, "candidates")?.items).filter((candidate) => !isConfiguredCandidate(candidate, robots));
  const decision = candidateAffordance(context);
  return {
    summary: robots.length ? t(texts, "setup.step.robots.done", { robots: robots.map((robot) => robot.name).join(", ") }) : null,
    text: t(texts, robots.length ? "setup.step.robots.more" : "setup.step.robots.text"),
    note: candidates.length || robots.length ? null : t(texts, "setup.step.robots.none"),
    candidates: candidates.map((candidate) => ({ key: candidate.registryId, entityId: candidate.entityId, name: candidate.name, detail: [candidate.entityId, adapterLabel(texts, candidate.adapter)].join(" · "), decision })),
  };
}

function roomsStep(model, texts, context, step) {
  const index = roomIndex(model);
  const usable = roomsOf(model).filter((room) => room.enabled && !room.areaMissing);
  const uncovered = step.uncovered.slice(0, SETUP_ROOM_LIMIT).map((roomId) => {
    const room = index.byId.get(roomId);
    return { key: roomId, roomId, name: roomName(roomId, index, model), decision: roomAffordances(room, context).edit };
  });
  return {
    summary: usable.length ? t(texts, "setup.step.rooms.done", { count: number(texts, step.count), total: number(texts, usable.length) }) : null,
    text: t(texts, "setup.step.rooms.text"),
    note: usable.length ? null : t(texts, "setup.step.rooms.none"),
    uncovered,
    more: Math.max(0, step.uncovered.length - uncovered.length),
  };
}

function releaseStep(model, texts, context, step) {
  const covered = new Set(robotsOf(model).flatMap((robot) => Object.keys(robot.capabilities?.targets || {})));
  const candidates = roomsOf(model).filter((room) => room.enabled && !room.areaMissing && covered.has(room.roomId) && !room.released && !room.release);
  const rooms = candidates.slice(0, SETUP_ROOM_LIMIT).map((room) => ({ key: room.roomId, roomId: room.roomId, name: room.name, decision: roomAffordances(room, context).release }));
  return {
    summary: step.count ? t(texts, "setup.step.release.done", { count: number(texts, step.count) }) : null,
    text: t(texts, "setup.step.release.text"),
    rooms,
    more: Math.max(0, candidates.length - rooms.length),
  };
}

function firstJobStep(model, texts, context, step) {
  return {
    summary: step.done ? t(texts, "setup.step.firstJob.done") : null,
    text: t(texts, "setup.step.firstJob.text"),
    create: decide(context, { operation: "create_job", target: CREATE_TARGET }),
  };
}

export function buildSetupView({ model, texts, context }) {
  const setup = model.setup;
  if (!setup?.known) return { key: "setup", loading: true, steps: [] };
  const builders = { robots: robotsStep, rooms: roomsStep, release: releaseStep, firstJob: firstJobStep };
  const current = setup.next;
  return {
    key: "setup",
    loading: false,
    complete: setup.complete,
    allDone: SETUP_STEPS.every((step) => setup.steps[step].done),
    steps: SETUP_STEPS.map((key, position) => {
      const state = setup.steps[key];
      return {
        key,
        number: position + 1,
        title: t(texts, `setup.step.${key}.title`),
        done: state.done,
        current: key === current,
        ...builders[key](model, texts, context, state),
      };
    }),
  };
}
