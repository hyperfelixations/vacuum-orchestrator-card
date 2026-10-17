// The main panel (RCC main panel): the waiting-job count as the headline, the queue's run state
// beside it, and the queue-wide controls the integration offers: run, pause or resume, and end.
// Every value is the integration's.

import { queueAffordances } from "../../domain/affordances.js";
import { queueRunPhase } from "../../domain/queue.js";
import { list, robotsOf, slotData } from "../common/lookups.js";
import { number, queueModeLabel, relative, t } from "../common/texts.js";
import { robotStatus } from "../common/robot-status.js";

export const PANEL_ROBOTS = 3;

const CONTROL_ICON = Object.freeze({ run_queue: "mdi:play", pause_queue: "mdi:pause", resume_queue: "mdi:play" });
const CONTROL_LABEL = Object.freeze({ run_queue: "panel.control.run", pause_queue: "panel.control.pause", resume_queue: "panel.control.resume" });

function runLine(queue, model, texts) {
  const phase = queueRunPhase(queue?.run);
  if (phase === "ending") return t(texts, "panel.ending");
  if (phase === "paused" || queue?.mode === "paused") return t(texts, "panel.paused");
  if (phase === "standby" && queue.run.endsAt !== null) return t(texts, "panel.runEnding", { when: relative(texts, queue.run.endsAt, model.nowMs) });
  if (phase !== "off" || queue?.mode === "running") return t(texts, "panel.running");
  return t(texts, "panel.idle");
}

export function buildPanel({ model = {}, config = {}, texts, context } = {}) {
  const queue = slotData(model, "queue");
  const mode = queue?.mode ?? model.live?.mode ?? "idle";
  const waiting = queue?.total ?? model.live?.pendingJobs ?? null;
  const robots = robotsOf(model).slice(0, PANEL_ROBOTS).map((robot) => robotStatus(robot, model, texts));
  const decisions = queueAffordances(queue, context);
  const idle = waiting === 0 && list(slotData(model, "openJobs")?.jobs).length === 0;
  return {
    visible: config.show?.panel !== false,
    label: t(texts, "panel.waiting"),
    value: waiting === null ? "—" : number(texts, waiting),
    mode,
    modeLabel: queueModeLabel(texts, mode),
    runLine: runLine(queue, model, texts),
    robots: robots.map((robot) => ({ key: robot.robotId, text: robot.summary, tone: robot.tone })),
    // With nothing waiting or started, adding a job is the next step; the queue control stays quiet
    // (UI-19).
    control: config.show?.queue_controls === false || decisions.command === null
      ? null
      : { command: decisions.command, action: "queue-control", icon: CONTROL_ICON[decisions.command], label: t(texts, CONTROL_LABEL[decisions.command]), decision: decisions.control, primary: !idle },
    end: config.show?.queue_controls === false || decisions.end.state === "hidden" ? null : { action: "end-queue", icon: "mdi:stop", label: t(texts, "panel.control.end"), decision: decisions.end },
  };
}
