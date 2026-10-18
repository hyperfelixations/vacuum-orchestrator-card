// The setup assistant: the integration's four setup steps in order, each with what the
// integration reports and where it is changed. No step is mandatory; the open step is the one
// the user picked, else the first. "Done" records the end of the assistant in the integration.
// See internal dev doc §8 "Einrichtung".

import { SETUP_STEPS } from "../../domain/setup.js";
import { QUEUE_TARGET, SETUP_TARGET, candidateAffordance, decide, robotTarget, roomAffordances } from "../../domain/affordances.js";
import { isConfiguredCandidate } from "../../domain/robots.js";
import { list, robotsOf, roomIndex, roomName, slotData } from "../common/lookups.js";
import { adapterLabel, number, seconds, t } from "../common/texts.js";

// The UI choice naming the step the user opened.
export const SETUP_STEP_CHOICE = "setup:step";

export const SETUP_ROOM_LIMIT = 6;

export function setupNeeded(model) {
  return model.setup?.assistantPending === true;
}

// SET-06, SET-10: the assistant is offered while setup is pending, unless set aside for this
// session; it is where the card starts only while no job is under way.
export function setupOffered(model, ui) {
  return setupNeeded(model) && ui?.setupDeferred !== true;
}

export function setupFirst(model, ui) {
  const started = list(slotData(model, "openJobs")?.jobs).some((job) => job.state === "dispatching" || job.state === "running");
  return setupOffered(model, ui) && !started;
}

function robotsStep(model, texts, context, step) {
  const robots = robotsOf(model);
  const names = step.robotIds.map((robotId) => robots.find((robot) => robot.robotId === robotId)?.name ?? robotId);
  const candidates = list(slotData(model, "candidates")?.items).filter((candidate) => !isConfiguredCandidate(candidate, robots));
  const decision = candidateAffordance(context);
  return {
    summary: names.length ? t(texts, "setup.step.robots.done", { robots: names.join(", ") }) : null,
    text: t(texts, names.length ? "setup.step.robots.more" : "setup.step.robots.text"),
    note: candidates.length || names.length ? null : t(texts, "setup.step.robots.none"),
    // Each robot taken over can be renamed here.
    robots: step.robotIds.map((robotId) => ({ key: robotId, robotId, name: robots.find((robot) => robot.robotId === robotId)?.name ?? robotId, rename: { action: "rename-robot", decision: decide(context, { operation: "rename_robot", target: robotTarget(robotId) }) } })),
    candidates: candidates.map((candidate) => ({ key: candidate.registryId, entityId: candidate.entityId, name: candidate.name, detail: [candidate.entityId, adapterLabel(texts, candidate.adapter)].join(" · "), decision })),
  };
}

function roomsStep(model, texts, context, step) {
  const index = roomIndex(model);
  const total = step.roomIds.length;
  const uncovered = step.unreachableRoomIds.slice(0, SETUP_ROOM_LIMIT).map((roomId) => ({ key: roomId, roomId, name: roomName(roomId, index, model), decision: roomAffordances(index.byId.get(roomId), context).edit }));
  return {
    summary: total ? t(texts, "setup.step.rooms.done", { count: number(texts, total - step.unreachableRoomIds.length), total: number(texts, total) }) : null,
    text: t(texts, "setup.step.rooms.text"),
    note: total ? null : t(texts, "setup.step.rooms.none"),
    uncovered,
    more: Math.max(0, step.unreachableRoomIds.length - uncovered.length),
  };
}

function defaultsStep(model, texts, context, step) {
  return {
    summary: step.configured ? t(texts, "setup.step.defaults.done") : null,
    builtIn: !step.configured,
    text: t(texts, "setup.step.defaults.text"),
    link: { action: "open-job-defaults", args: {}, icon: "mdi:tune-variant", label: t(texts, "setup.step.defaults.action"), decision: decide(context, { operation: "configure_job_defaults", target: QUEUE_TARGET }) },
  };
}

function queueStep(model, texts, context, step) {
  const grace = step.graceSeconds === null ? null : step.graceSeconds > 0 ? seconds(texts, step.graceSeconds) : t(texts, "settings.graceOff");
  return {
    summary: grace !== null && step.startDelaySeconds !== null ? t(texts, "setup.step.queue.done", { value: grace, delay: seconds(texts, step.startDelaySeconds) }) : null,
    text: t(texts, "setup.step.queue.text"),
    link: { action: "open-queue-settings", args: {}, icon: "mdi:timer-sand", label: t(texts, "setup.step.queue.action"), decision: decide(context, { operation: "configure_queue", target: QUEUE_TARGET }) },
  };
}

const BUILDERS = Object.freeze({ robots: robotsStep, rooms: roomsStep, defaults: defaultsStep, queue: queueStep });

export function buildSetupView({ model, texts, context, ui = {} }) {
  const setup = model.setup;
  // SET-12: a setup that could not be read says why, with a way to try again.
  if (!setup) {
    const error = model.slots?.setup?.error ?? null;
    return { key: "setup", loading: !error, error, steps: [] };
  }
  const chosen = ui.choices?.[SETUP_STEP_CHOICE];
  const current = SETUP_STEPS.includes(chosen) ? chosen : SETUP_STEPS[0];
  return {
    key: "setup",
    loading: false,
    pending: setup.assistantPending,
    finish: setup.assistantPending ? decide(context, { operation: "complete_setup", target: SETUP_TARGET }) : null,
    steps: SETUP_STEPS.map((key, position) => ({
      key,
      number: position + 1,
      title: t(texts, `setup.step.${key}.title`),
      current: key === current,
      builtIn: false,
      ...BUILDERS[key](model, texts, context, setup.steps[key]),
    })),
  };
}
