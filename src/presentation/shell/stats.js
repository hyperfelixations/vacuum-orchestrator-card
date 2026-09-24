// The status strip. The push-based diagnostic entities answer first; the query snapshot fills
// in where they are absent. A figure the backend does not report is a dash, never a 0.

export function buildStats(model = {}, texts) {
  const number = (value) => (Number.isFinite(value) ? texts.formatNumber(value, 0) : "—");
  const status = model.entityStatus?.available ? model.entityStatus : {};
  const queued = status.queueLength ?? (model.queue?.available ? model.queue.total : null);
  const active = status.activeJobs ?? (model.active?.available ? model.active.jobs.length : null);
  const attention = status.attentionJobs ?? (model.attention?.available ? model.attention.jobs.length : null);
  const robots = model.robots?.available ? model.robots.items : null;
  return [
    { key: "queueLength", label: texts.t("stat.queueLength"), value: number(queued) },
    { key: "activeJobs", label: texts.t("stat.activeJobs"), value: number(active) },
    { key: "attentionJobs", label: texts.t("stat.attentionJobs"), value: number(attention) },
    {
      key: "robotsAvailable",
      label: texts.t("stat.robotsAvailable"),
      value: robots ? `${number(robots.filter((robot) => robot.availability === "available").length)} / ${number(robots.length)}` : "—",
    },
  ];
}
