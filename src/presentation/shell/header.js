// The header: icon, title, the automatic status sentence and the pill (RCC header contract).
// `show` decides whether a part is drawn; the option decides what it says.

import { list, roomIndex, robotName, slotData, jobTitle } from "../common/lookups.js";
import { jobStateLabel, relative, t } from "../common/texts.js";

function attentionSentence(model, texts) {
  const targets = list(slotData(model, "queue")?.recoveryTargets);
  if (targets.length === 1) return t(texts, "subtitle.recoveryOne", { robot: robotName(targets[0].robotId, model) });
  if (targets.length > 1) return t(texts, "subtitle.recoveryMany", { count: targets.length });
  const count = list(slotData(model, "openJobs")?.jobs).filter((job) => job.state === "needs_attention").length || model.live?.attentionCount || slotData(model, "queue")?.attentionCount || 0;
  return count ? t(texts, "subtitle.attentionJobs", { count }) : t(texts, "subtitle.attention");
}

export function automaticSubtitle(model, status, texts) {
  const queue = slotData(model, "queue");
  const waiting = queue?.total ?? model.live?.pendingJobs ?? 0;
  switch (status) {
    case "attention":
      return attentionSentence(model, texts);
    case "cleaning": {
      const job = list(slotData(model, "openJobs")?.jobs).find((entry) => entry.state !== "needs_attention");
      return t(texts, "subtitle.activeJob", { job: jobTitle(job, roomIndex(model), model), state: jobStateLabel(texts, job?.state) });
    }
    case "running":
      if (queue?.run?.active && queue.run.deadline !== null) return t(texts, "subtitle.runEnding", { when: relative(texts, queue.run.deadline, model.nowMs) });
      return waiting ? t(texts, "subtitle.waitingRunning", { count: waiting }) : t(texts, "subtitle.running");
    case "paused":
      return t(texts, "subtitle.waitingPaused", { count: waiting });
    case "idle":
      return waiting ? t(texts, "subtitle.waiting", { count: waiting }) : t(texts, "subtitle.nothingWaiting");
    case "setup":
      return waiting ? t(texts, "subtitle.waiting", { count: waiting }) : t(texts, "subtitle.setupIncomplete");
    default:
      return t(texts, `subtitle.${status}`);
  }
}

// `data-parts` lists the present header parts when one is missing (RCC header layout).
export function buildHeader({ model = {}, config = {}, texts, status } = {}) {
  const show = config.show || {};
  const title = config.title?.text ?? t(texts, "card.title");
  const subtitle = config.subtitle?.text ?? automaticSubtitle(model, status, texts);
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
