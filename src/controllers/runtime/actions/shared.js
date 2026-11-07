// What the action modules share: the scopes a kind of command invalidates, the job states that
// count as started and lookups in the card's model. See internal dev doc §9 "Aktionsvertrag".

export const QUEUE_SCOPES = Object.freeze(["queue", "openJobs", "jobLog", "job", "execution", "trace"]);
export const ROOM_SCOPES = Object.freeze(["rooms", "queue", "openJobs", "job", "execution"]);
export const ROBOT_SCOPES = Object.freeze(["robots", "candidates", "rooms", "queue", "openJobs", "execution", "registry"]);
export const STARTED_STATES = Object.freeze(["dispatching", "running"]);
export const ALL = "all";

export function findIn(model, slot, idKey, id) {
  const data = model?.slots?.[slot]?.data;
  const items = data?.items || data?.jobs || [];
  return items.find((item) => item[idKey] === id) || null;
}

export function findJob(model, jobId) {
  const detail = model?.slots?.job?.data;
  if (detail?.jobId === jobId) return detail;
  for (const slot of ["queue", "openJobs", "jobLog"]) {
    const job = findIn(model, slot, "jobId", jobId);
    if (job) return job;
  }
  return null;
}

export const jobDefaults = (model) => model?.slots?.queue?.data?.jobDefaults ?? null;

// For pages that edit their values on the page itself (`overlay:<key>`): the field an error of the
// integration names by the command field it starts with.
export const pageFields = (fields) => (path) => fields[String(path).split(".")[0]] ?? null;
