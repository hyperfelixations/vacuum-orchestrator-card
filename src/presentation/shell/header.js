// The header: icon, title, the automatic status sentence and the pill (RCC header contract).
// `show` decides whether a part is drawn; the option decides what it says.

import { faultsText } from "../common/faults.js";
import { list, roomIndex, robotName, slotData, jobTitle } from "../common/lookups.js";
import { jobStateLabel, relative, t } from "../common/texts.js";

function attentionSentence(model, texts) {
  const targets = list(slotData(model, "queue")?.recoveryTargets);
  if (targets.length === 1) return t(texts, "subtitle.recoveryOne", { robot: robotName(targets[0].robotId, model) });
  if (targets.length > 1) return t(texts, "subtitle.recoveryMany", { count: targets.length });
  // The integration's attention items are faults and recoveries, not jobs; only jobs that need
  // clarification are counted as jobs.
  const count = list(slotData(model, "openJobs")?.jobs).filter((job) => job.state === "needs_attention").length;
  if (count) return t(texts, "subtitle.attentionJobs", { count });
  const faults = list(slotData(model, "queue")?.attention).filter((entry) => entry.kind === "device_fault" && entry.robotId);
  if (faults.length === 1) return t(texts, "subtitle.deviceOne", { robot: robotName(faults[0].robotId, model), what: faultsText(faults[0].codes, faults[0].robotId, { model, texts }) });
  if (faults.length > 1) return t(texts, "subtitle.deviceMany", { count: new Set(faults.map((entry) => entry.robotId)).size });
  return t(texts, "subtitle.attention");
}

// `panelShown`: the main panel already counts the waiting jobs and says how the queue runs, so the
// subtitle names the next job or that the run waits for new work instead (UI-03).
export function automaticSubtitle(model, status, texts, { panelShown = false } = {}) {
  const queue = slotData(model, "queue");
  const waiting = queue?.total ?? model.live?.pendingJobs ?? 0;
  const next = panelShown && waiting && queue?.offset === 0 ? list(queue.jobs)[0] : null;
  if (next && (status === "running" || status === "paused" || status === "idle" || status === "waiting")) return t(texts, "subtitle.next", { job: jobTitle(next, roomIndex(model), model) });
  switch (status) {
    case "attention":
      return attentionSentence(model, texts);
    case "cleaning": {
      // UI-03: the pill says the robot cleans; the subtitle names the job and the robot running it,
      // and the state only where it is not plain cleaning (starting, cancelling).
      const job = list(slotData(model, "openJobs")?.jobs).find((entry) => entry.state !== "needs_attention");
      const robot = job?.state === "running" && job.progress?.robotId ? robotName(job.progress.robotId, model) : "";
      return t(texts, "subtitle.activeJob", { job: jobTitle(job, roomIndex(model), model), detail: robot || jobStateLabel(texts, job?.state) });
    }
    case "running":
      if (queue?.run?.phase === "standby" && queue.run.endsAt !== null) return panelShown ? t(texts, "subtitle.waitingForWork") : t(texts, "subtitle.runEnding", { when: relative(texts, queue.run.endsAt, model.nowMs) });
      return waiting ? t(texts, "subtitle.waitingRunning", { count: waiting }) : t(texts, "subtitle.running");
    case "paused":
      return t(texts, "subtitle.waitingPaused", { count: waiting });
    case "idle":
    case "waiting":
      return waiting ? t(texts, "subtitle.waiting", { count: waiting }) : t(texts, "subtitle.nothingWaiting");
    case "setup":
      return waiting ? t(texts, "subtitle.waiting", { count: waiting }) : t(texts, "subtitle.setupIncomplete");
    // While the integration cannot be shown, the onboarding says why (V6).
    default:
      return "";
  }
}

// `data-parts` lists the present header parts when one is missing (RCC header layout).
export function buildHeader({ model = {}, config = {}, texts, status } = {}) {
  const show = config.show || {};
  const title = config.title?.text ?? t(texts, "card.title");
  const subtitle = config.subtitle?.text ?? automaticSubtitle(model, status, texts, { panelShown: show.panel !== false });
  const hasIcon = show.icon !== false;
  const hasTitle = show.title !== false && title !== "";
  const hasSubtitle = show.subtitle !== false && subtitle !== "";
  const hasPill = show.pill !== false;
  const parts = [hasIcon && "icon", (hasTitle || hasSubtitle) && "title", hasPill && "pill"].filter(Boolean);
  return {
    visible: parts.length > 0,
    parts: parts.length === 3 ? null : parts.join(" "),
    hasIcon,
    icon: config.icon || "mdi:robot-vacuum",
    hasTitle,
    title,
    titleOverflow: config.title?.overflow || "wrap",
    hasSubtitle,
    subtitle,
    subtitleOverflow: config.subtitle?.overflow || "clip",
    hasPill,
    pill: t(texts, `status.${status}`),
  };
}
