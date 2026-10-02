// Names for the identities views receive: rooms, robots, jobs and entities. A missing name
// falls back to the integration's own label, then to the id; nothing is guessed.

export const list = (value) => (Array.isArray(value) ? value : []);

export function slotData(model, slot) {
  return model?.slots?.[slot]?.data ?? null;
}

export function roomsOf(model) {
  return list(slotData(model, "rooms")?.items);
}

export function robotsOf(model) {
  return list(slotData(model, "robots")?.items);
}

export function roomIndex(model) {
  const byId = new Map();
  const byArea = new Map();
  for (const room of roomsOf(model)) {
    byId.set(room.roomId, room);
    if (room.areaId) byArea.set(room.areaId, room);
  }
  return { byId, byArea };
}

// A job carries canonical room ids and possibly area aliases; both resolve to the VOI room.
export function roomName(id, index, model) {
  const room = index?.byId.get(id) || index?.byArea.get(id);
  if (room) return room.name;
  const area = list(model?.areas).find((entry) => entry.areaId === id);
  return area?.name || id || "";
}

export function robotName(robotId, model) {
  if (!robotId) return "";
  return robotsOf(model).find((robot) => robot.robotId === robotId)?.name || robotId;
}

export function entityName(entityId, model) {
  if (!entityId) return "";
  const reading = model?.entityReadings?.[entityId];
  if (reading?.name) return reading.name;
  const entry = list(model?.entityCatalog).find((candidate) => candidate.entityId === entityId);
  return entry?.name && entry.name !== entityId ? entry.name : entityId;
}

// A job's display name: its own name, else its rooms.
export function jobTitle(job, index, model) {
  if (!job) return "";
  return job.name || list(job.roomIds).map((roomId) => roomName(roomId, index, model)).join(", ") || job.jobId;
}

export function allJobs(model) {
  return [...list(slotData(model, "openJobs")?.jobs), ...list(slotData(model, "queue")?.jobs), ...list(slotData(model, "jobLog")?.jobs)];
}

export function findJob(model, jobId) {
  if (!jobId) return null;
  const detail = slotData(model, "job");
  if (detail?.jobId === jobId) return detail;
  return allJobs(model).find((job) => job.jobId === jobId) || null;
}
