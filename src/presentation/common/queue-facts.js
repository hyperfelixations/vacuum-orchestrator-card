// The queue's mode and counts for the card's status, panel and subtitle, so they never disagree:
// the session's live values, the newest it knows from a queue read or an event, else the queue
// read. See internal dev doc §8 "Status und Ton".

import { slotData } from "./lookups.js";

export function queueFacts(model = {}) {
  const queue = slotData(model, "queue");
  const live = model.live ?? null;
  return Object.freeze({
    mode: live?.mode ?? queue?.mode ?? null,
    pendingJobs: live?.pendingJobs ?? queue?.total ?? null,
    needsAttention: live ? live.needsAttention === true : queue?.needsAttention === true,
    activeCount: live?.activeCount ?? queue?.activeCount ?? null,
    attentionCount: live?.attentionCount ?? queue?.attentionCount ?? null,
  });
}
