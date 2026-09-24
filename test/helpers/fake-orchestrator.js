// Deterministic HA-facing backend fake shared by unit, contract and browser harnesses.

const DOMAIN = "vacuum_orchestrator";
const WS = {
  QUEUE_GET: `${DOMAIN}/queue/get`,
  JOB_GET: `${DOMAIN}/job/get`,
  JOBS_LIST: `${DOMAIN}/jobs/list`,
  DESCRIBE: `${DOMAIN}/describe`,
  SUBSCRIBE: `${DOMAIN}/subscribe`,
  ROBOTS_LIST: `${DOMAIN}/robots/list`,
  AREAS_STATUS: `${DOMAIN}/areas/status`,
};

const BASE_CAPABILITIES = [
  "queueRead",
  "jobRead",
  "jobsHistory",
  "liveSubscribe",
  "jobCreate",
  "jobUpdate",
  "jobDelete",
  "jobMove",
  "jobStart",
  "jobCancel",
  "jobRetry",
  "queueRun",
  "queuePause",
  "queueResume",
];
const TARGET_CAPABILITIES = [
  ...BASE_CAPABILITIES,
  "jobsActive",
  "robotsRead",
  "areasRead",
  "jobProgress",
  "jobBlockedReason",
  "recoveryResolve",
  "describe",
];

class VirtualClock {
  constructor(now = 0) {
    this.time = Number.isFinite(now) ? now : 0;
    this.nextHandle = 1;
    this.timers = new Map();
  }

  now() {
    return this.time;
  }

  setTimeout(callback, delay = 0) {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + Math.max(0, delay), callback });
    return handle;
  }

  clearTimeout(handle) {
    this.timers.delete(handle);
  }

  advance(ms) {
    const target = this.time + Math.max(0, ms);
    let guard = 0;
    while (true) {
      let selected = null;
      for (const [handle, timer] of this.timers) {
        if (timer.at <= target && (!selected || timer.at < selected.timer.at)) selected = { handle, timer };
      }
      if (!selected) break;
      this.time = selected.timer.at;
      this.timers.delete(selected.handle);
      selected.timer.callback();
      if (++guard > 10000) throw new Error("fake orchestrator timer storm");
    }
    this.time = target;
  }
}

function ownClock(input) {
  if (!input) return new VirtualClock();
  if (typeof input.now === "function" && typeof input.setTimeout === "function") return input;
  return new VirtualClock(Number.isFinite(input.nowMs) ? input.nowMs : 0);
}

function iso(clock, value = null) {
  return new Date(value === null ? clock.now() : value).toISOString();
}

function canonicalMode(value) {
  return {
    vac: "vacuum",
    vacuum: "vacuum",
    mop: "mop",
    vac_and_mop: "vacuum_and_mop",
    vacuum_and_mop: "vacuum_and_mop",
    vac_then_mop: "vacuum_then_mop",
    vacuum_then_mop: "vacuum_then_mop",
  }[value] || null;
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

function error(code, detail = null) {
  return { code, detail, message: detail || code };
}

function reject(code, detail = null) {
  return Promise.reject(error(code, detail));
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function defaultJob(clock, id, data, revision = 1) {
  const mode = canonicalMode(data.mode);
  const areas = Array.isArray(data.areas) ? [...data.areas] : [];
  const timestamp = iso(clock);
  return {
    api_version: 2,
    job_id: id,
    revision,
    state: "queued",
    name: data.name ?? null,
    areas,
    mode,
    vacuum_power: data.vacuum_power ?? null,
    mop_intensity: data.mop_intensity ?? null,
    mop_route: data.mop_route ?? null,
    passes: data.passes ?? 1,
    source: data.source ?? null,
    reason: data.reason ?? null,
    note: data.note ?? null,
    dedupe_key: data.dedupe_key ?? null,
    required_on: Array.isArray(data.required_on) ? [...data.required_on] : [],
    required_off: Array.isArray(data.required_off) ? [...data.required_off] : [],
    settings_policy: data.settings_policy ?? "best_effort",
    created_at: data.created_at ?? timestamp,
    updated_at: data.updated_at ?? timestamp,
    active_attempt_id: data.active_attempt_id ?? null,
    retries_job_id: data.retries_job_id ?? null,
    failure_code: data.failure_code ?? null,
    readiness: data.readiness ?? { state: "ready", failed_on: [], failed_off: [], unknown: [] },
    assigned_robot_id: data.assigned_robot_id ?? null,
    started_at: data.started_at ?? null,
    finished_at: data.finished_at ?? null,
    blocked_reason: data.blocked_reason ?? null,
    active_work_unit_id: data.active_work_unit_id ?? null,
    work_units: Array.isArray(data.work_units) ? copy(data.work_units) : [],
  };
}

function defaultRobot() {
  return {
    robot_id: "robot-1",
    name: "Robot 1",
    adapter: "fake",
    vacuum_entity_id: "vacuum.fake_robot",
    availability: "available",
    battery_percentage: 87,
    active_job_id: null,
    active_area_id: null,
    blocked_reason: null,
    allowed_area_ids: ["kitchen", "hall", "bathroom"],
    map_image_entity_id: null,
    capabilities: {
      operations: ["vacuum", "mop", "vacuum_and_mop"],
      max_passes: 3,
      pass_scope: "target_set",
      vacuum_levels: ["standard", "high", "maximum"],
      water_levels: ["standard", "high"],
      mop_routes: ["standard", "deep", "fast"],
      cancel: true,
    },
  };
}

function defaultArea(areaId) {
  return {
    area_id: areaId,
    last_vacuumed_at: null,
    last_mopped_at: null,
    vacuum_due_at: null,
    mop_due_at: null,
    due_state: "unknown",
    release_entity_id: null,
    blocking_entity_ids: [],
    open_job_ids: [],
  };
}

function serviceNames(capabilities) {
  const mapping = {
    jobCreate: "create_job",
    jobUpdate: "update_job",
    jobDelete: "delete_job",
    jobMove: "move_job",
    jobStart: "start_job",
    jobCancel: "cancel_job",
    jobRetry: "retry_job",
    queueRun: "run_queue",
    queuePause: "pause_queue",
    queueResume: "resume_queue",
  };
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([capability]) => capabilities.includes(capability))
      .map(([, service]) => [service, {}])
  );
}

function makeEmitter() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    emit(type, value) {
      for (const callback of [...(listeners.get(type) || [])]) callback(value);
    },
  };
}

function createFakeOrchestrator({ profile = "today", clock = null, seed = null } = {}) {
  if (!new Set(["today", "target"]).has(profile)) throw new TypeError("unknown fake profile");
  const virtualClock = ownClock(clock);
  let capabilities = [...(profile === "target" ? TARGET_CAPABILITIES : BASE_CAPABILITIES)];
  let connected = true;
  let commandCounter = 0;
  let jobCounter = 0;
  let commitId = 0;
  let queueRevision = 0;
  let sequence = 0;
  let mode = "idle";
  let gapNext = false;
  const jobs = new Map();
  const queue = [];
  const robots = [];
  const areas = new Map();
  const subscriptions = new Set();
  const failures = [];
  const calls = { ws: [], services: [], events: [] };
  const connection = makeEmitter();
  const hassBindings = new Set();

  function has(capability) {
    return capabilities.includes(capability);
  }

  function now() {
    return typeof virtualClock.now === "function" ? virtualClock.now() : 0;
  }

  function consumeFailure() {
    return failures.shift() || null;
  }

  function maybeFail({ forEvent = false } = {}) {
    const next = failures[0];
    if (!next || (next === "commit_gap" && !forEvent)) return null;
    failures.shift();
    if (next === "timeout") return "timeout";
    if (next === "disconnect") {
      connected = false;
      return error("orchestrator_not_loaded", "fake disconnected");
    }
    return error(next, next);
  }

  function checkConnected() {
    if (!connected) return error("orchestrator_not_loaded", "fake disconnected");
    return null;
  }

  function nextCommandId() {
    commandCounter += 1;
    return `fake-command-${commandCounter}`;
  }

  function validateIntent(data) {
    if (!Array.isArray(data.areas) || data.areas.length === 0) return "job_requires_area";
    if (new Set(data.areas).size !== data.areas.length) return "duplicate_area";
    if (!canonicalMode(data.mode)) return "invalid_cleaning_mode";
    if (!Number.isInteger(data.passes ?? 1) || data.passes < 1 || data.passes > 10) return "invalid_pass_count";
    for (const field of ["name", "source", "reason", "note", "dedupe_key"]) {
      if (data[field] !== undefined && data[field] !== null && (typeof data[field] !== "string" || !data[field].trim())) return `empty_${field}`;
    }
    const on = Array.isArray(data.required_on) ? data.required_on : [];
    const off = Array.isArray(data.required_off) ? data.required_off : [];
    if (new Set(on).size !== on.length) return "invalid_required_on";
    if (new Set(off).size !== off.length) return "invalid_required_off";
    if (on.some((value) => off.includes(value))) return "contradictory_state_requirement";
    return null;
  }

  function touch({ queueChanged = false } = {}) {
    commitId += 1;
    if (queueChanged) queueRevision += 1;
    sequence += 1;
    emit();
  }

  function serialize(job) {
    const result = copy(job);
    result.api_version = 2;
    if (job.state !== "queued" && profile !== "target") delete result.readiness;
    if (!has("jobProgress")) {
      delete result.active_work_unit_id;
      delete result.work_units;
    }
    if (!has("jobBlockedReason")) delete result.blocked_reason;
    return result;
  }

  function queuePage(offset = 0, limit = 50) {
    return {
      api_version: 2,
      commit_id: commitId,
      queue_revision: queueRevision,
      mode,
      needs_attention: [...jobs.values()].some((job) => job.state === "needs_attention"),
      total: queue.length,
      offset,
      limit,
      jobs: queue.slice(offset, offset + limit).map((id) => serialize(jobs.get(id))),
    };
  }

  function registryPage(offset = 0, limit = 50, options = {}) {
    let records = [...jobs.values()].sort((left, right) => {
      const leftTime = Date.parse(left.created_at);
      const rightTime = Date.parse(right.created_at);
      return options.order === "created_asc" ? leftTime - rightTime : rightTime - leftTime;
    });
    if (Array.isArray(options.states) && has("jobsActive")) records = records.filter((job) => options.states.includes(job.state));
    return {
      api_version: 2,
      total: records.length,
      offset,
      limit,
      jobs: records.slice(offset, offset + limit).map(serialize),
    };
  }

  function emit() {
    const gap = failures[0] === "commit_gap";
    if (gap) {
      failures.shift();
      commitId += 1;
      sequence += 1;
    }
    const event = {
      api_version: 2,
      commit_id: commitId,
      queue_revision: queueRevision,
      mode,
      pending_jobs: queue.length,
      needs_attention: [...jobs.values()].some((job) => job.state === "needs_attention"),
    };
    if (has("describe") || profile === "target") {
      event.sequence = sequence;
      event.attention_job_ids = [...jobs.values()].filter((job) => job.state === "needs_attention").map((job) => job.job_id);
    }
    calls.events.push(copy(event));
    for (const callback of [...subscriptions]) callback(copy(event));
  }

  function mutate(action, data = {}) {
    const commandId = nextCommandId();
    const injected = maybeFail();
    if (injected === "timeout") return new Promise(() => {});
    if (injected) return Promise.reject(injected);
    const availability = checkConnected();
    if (availability) return Promise.reject(availability);
    let response = null;
    let queueChanged = false;
    if (!has({
      create_job: "jobCreate",
      update_job: "jobUpdate",
      delete_job: "jobDelete",
      move_job: "jobMove",
      start_job: "jobStart",
      cancel_job: "jobCancel",
      retry_job: "jobRetry",
      run_queue: "queueRun",
      pause_queue: "queuePause",
      resume_queue: "queueResume",
    }[action])) return Promise.reject(error("unknown_command", action));
    if (action === "create_job") {
      const invalid = validateIntent(data);
      if (invalid) return Promise.reject(error(invalid));
      const id = data.job_id || `job-${++jobCounter}`;
      const job = defaultJob(virtualClock, id, data, 1);
      jobs.set(id, job);
      queue.push(id);
      response = { job_id: id };
      queueChanged = true;
    } else if (action === "update_job") {
      const job = jobs.get(data.job_id);
      if (!job) return Promise.reject(error("unknown_job"));
      if (job.state !== "queued") return Promise.reject(error("job_not_editable"));
      const next = { ...job };
      for (const key of ["areas", "mode", "name", "vacuum_power", "mop_intensity", "mop_route", "passes", "source", "reason", "note", "dedupe_key", "required_on", "required_off", "settings_policy"]) {
        if (Object.prototype.hasOwnProperty.call(data, key)) next[key] = Array.isArray(data[key]) ? [...data[key]] : data[key];
      }
      const invalid = validateIntent(next);
      if (invalid) return Promise.reject(error(invalid));
      next.mode = canonicalMode(next.mode);
      next.revision += 1;
      next.updated_at = iso(virtualClock);
      jobs.set(next.job_id, next);
      response = { job_id: next.job_id };
    } else if (action === "delete_job") {
      const job = jobs.get(data.job_id);
      if (!job) return Promise.reject(error("unknown_job"));
      if (!(job.state === "queued" || ["completed", "failed", "cancelled"].includes(job.state))) return Promise.reject(error("job_not_deletable"));
      jobs.delete(job.job_id);
      const index = queue.indexOf(job.job_id);
      if (index >= 0) queue.splice(index, 1);
      response = { job_id: job.job_id };
      queueChanged = index >= 0;
    } else if (action === "move_job") {
      const index = queue.indexOf(data.job_id);
      if (index < 0) return Promise.reject(error("job_not_movable"));
      const direction = data.direction;
      const target = direction === "top" ? 0 : direction === "bottom" ? queue.length - 1 : direction === "up" ? Math.max(0, index - 1) : Math.min(queue.length - 1, index + 1);
      queue.splice(index, 1);
      queue.splice(target, 0, data.job_id);
      response = { job_id: data.job_id, direction };
      queueChanged = target !== index;
    } else if (action === "start_job") {
      const job = jobs.get(data.job_id);
      if (!job) return Promise.reject(error("unknown_job"));
      if (job.state !== "queued") return Promise.reject(error("job_not_startable"));
      const robot = data.robot_id ? robots.find((item) => item.robot_id === data.robot_id) : robots.find((item) => item.availability === "available");
      if (profile === "target" && !robot) return Promise.reject(error("no_robot_configured"));
      job.state = "running";
      job.assigned_robot_id = robot?.robot_id ?? null;
      job.started_at = iso(virtualClock);
      job.active_attempt_id = `${job.job_id}-attempt-1`;
      job.revision += 1;
      job.updated_at = iso(virtualClock);
      const index = queue.indexOf(job.job_id);
      if (index >= 0) queue.splice(index, 1);
      if (robot) {
        robot.availability = "busy";
        robot.active_job_id = job.job_id;
        robot.active_area_id = job.areas[0] || null;
      }
      response = { job_id: job.job_id, robot_id: robot?.robot_id ?? null };
      queueChanged = true;
    } else if (action === "cancel_job") {
      const job = jobs.get(data.job_id);
      if (!job) return Promise.reject(error("unknown_job"));
      if (job.state === "queued") {
        const index = queue.indexOf(job.job_id);
        if (index >= 0) queue.splice(index, 1);
        queueChanged = true;
      } else if (!["dispatching", "running", "canceling"].includes(job.state)) return Promise.reject(error("job_not_cancellable"));
      job.state = "cancelled";
      job.finished_at = iso(virtualClock);
      job.updated_at = iso(virtualClock);
      if (job.assigned_robot_id) {
        const robot = robots.find((item) => item.robot_id === job.assigned_robot_id);
        if (robot) {
          robot.availability = "available";
          robot.active_job_id = null;
          robot.active_area_id = null;
        }
      }
      response = { job_id: job.job_id };
    } else if (action === "retry_job") {
      const source = jobs.get(data.job_id);
      if (!source) return Promise.reject(error("unknown_job"));
      if (!["completed", "failed", "cancelled"].includes(source.state)) return Promise.reject(error("job_not_retryable"));
      const id = `job-${++jobCounter}`;
      const retried = defaultJob(virtualClock, id, { ...source, retries_job_id: source.job_id }, 1);
      retried.retries_job_id = source.job_id;
      jobs.set(id, retried);
      queue.push(id);
      response = { job_id: id };
      queueChanged = true;
    } else if (action === "run_queue" || action === "resume_queue") {
      mode = "running";
      response = { dispatched: 0, robot_ids: [] };
    } else if (action === "pause_queue") {
      mode = "paused";
      response = null;
    }
    touch({ queueChanged });
    return Promise.resolve({ command_id: commandId, ...copy(response || {}) });
  }

  async function query(message) {
    calls.ws.push(copy(message));
    const injected = maybeFail();
    if (injected === "timeout") return new Promise(() => {});
    if (injected) return reject(injected.code, injected.detail);
    const availability = checkConnected();
    if (availability) return reject(availability.code, availability.detail);
    if (message.type === WS.DESCRIBE) {
      if (!has("describe")) return reject("unknown_command");
      return {
        api_version: 2,
        integration_version: "fake-0.0.1",
        capabilities: [...capabilities],
        limits: { max_page_size: 100, max_areas_per_job: 20, max_passes: 10 },
      };
    }
    if (message.type === WS.QUEUE_GET) return queuePage(message.offset ?? 0, message.limit ?? 50);
    if (message.type === WS.JOB_GET) {
      const job = jobs.get(message.job_id);
      if (!job) return reject("unknown_job");
      return serialize(job);
    }
    if (message.type === WS.JOBS_LIST) return registryPage(message.offset ?? 0, message.limit ?? 50, message);
    if (message.type === WS.ROBOTS_LIST) {
      if (!has("robotsRead")) return reject("unknown_command");
      return { api_version: 2, robots: robots.map(copy) };
    }
    if (message.type === WS.AREAS_STATUS) {
      if (!has("areasRead")) return reject("unknown_command");
      return { api_version: 2, areas: [...areas.values()].map(copy) };
    }
    if (message.type === WS.SUBSCRIBE) return null;
    return reject("unknown_command", message.type);
  }

  function subscribe(callback) {
    if (!connected) return reject("orchestrator_not_loaded");
    subscriptions.add(callback);
    return Promise.resolve(() => subscriptions.delete(callback));
  }

  function attachTo(hassStub = {}) {
    const hass = hassStub;
    hass.config = hass.config || {};
    hass.config.components = hass.config.components || new Set();
    if (hass.config.components instanceof Set) hass.config.components.add(DOMAIN);
    else if (Array.isArray(hass.config.components) && !hass.config.components.includes(DOMAIN)) hass.config.components.push(DOMAIN);
    else if (hass.config.components && typeof hass.config.components === "object") hass.config.components[DOMAIN] = true;
    hass.services = hass.services || {};
    hass.services[DOMAIN] = serviceNames(capabilities);
    hass.connection = hass.connection || {};
    Object.assign(hass.connection, connection, {
      subscribeMessage: (_callback, message) => {
        if (message?.type !== WS.SUBSCRIBE) return reject("unknown_command");
        return subscribe(_callback);
      },
      sendMessagePromise: (message) => {
        if (message?.type === "call_service") return handleService(message.service, message.service_data || {}, true);
        return query(message);
      },
    });
    hass.callWS = (message) => query(message);
    // The fake stands in for the integration, not for all of Home Assistant: a call to any
    // other domain (the card toggles a room release through `homeassistant.toggle`) belongs to
    // the underlying stub.
    const foreignService = hass.callService;
    hass.callService = (domain, service, data, target, returnResponse, wantsResponse) => {
      calls.services.push({ domain, service, data: copy(data), target, returnResponse, wantsResponse });
      if (domain !== DOMAIN) return foreignService ? foreignService(domain, service, data, target, returnResponse, wantsResponse) : Promise.resolve({ context: {} });
      return handleService(service, data || {}, Boolean(wantsResponse));
    };
    hass.user = hass.user || { is_admin: true };
    hass.entities = hass.entities || [];
    hass.config.components = hass.config.components;
    hassBindings.add(hass);
    return hass;
  }

  async function handleService(service, data, wantsResponse) {
    const response = await mutate(service, data);
    if (wantsResponse) return response;
    return undefined;
  }

  function setCapabilities(next) {
    const value = typeof next === "string" ? next : null;
    if (value === "today" || value === "target") capabilities = [...(value === "target" ? TARGET_CAPABILITIES : BASE_CAPABILITIES)];
    else if (Array.isArray(next)) capabilities = [...new Set(next)];
    else if (next && Array.isArray(next.capabilities)) capabilities = [...new Set(next.capabilities)];
    const targetProfile = capabilities.includes("describe");
    profile = targetProfile ? "target" : "today";
    for (const hass of hassBindings) hass.services[DOMAIN] = serviceNames(capabilities);
    return Object.freeze([...capabilities]);
  }

  function failNext(code) {
    failures.push(code);
  }

  function disconnect() {
    connected = false;
    connection.emit("disconnected", { code: "orchestrator_not_loaded" });
  }

  function reconnect() {
    connected = true;
    connection.emit("connected", null);
  }

  function advance(ms) {
    if (typeof virtualClock.advance === "function") virtualClock.advance(ms);
  }

  function direct(action, data) {
    return mutate(action, data).then((result) => ({ ok: true, commandId: result.command_id, data: result })).catch((reason) => ({ ok: false, commandId: nextCommandId(), code: reason.code || "unknown", group: "unknown", detail: reason.detail || null }));
  }

  const api = {
    attachTo,
    setCapabilities,
    failNext,
    disconnect,
    reconnect,
    advance,
    getState: () => ({
      apiVersion: 2,
      commitId,
      queueRevision,
      sequence,
      mode,
      jobs: [...jobs.values()].map(copy),
      queue: [...queue],
      robots: robots.map(copy),
      areas: [...areas.values()].map(copy),
      capabilities: [...capabilities],
      connected,
    }),
    createJob: (payload) => direct("create_job", payload),
    updateJob: (jobId, patch) => direct("update_job", { job_id: jobId, ...patch }),
    deleteJob: (jobId) => direct("delete_job", { job_id: jobId }),
    moveJob: (jobId, direction) => direct("move_job", { job_id: jobId, direction }),
    startJob: (jobId, robotId) => direct("start_job", { job_id: jobId, ...(robotId ? { robot_id: robotId } : {}) }),
    cancelJob: (jobId) => direct("cancel_job", { job_id: jobId }),
    retryJob: (jobId) => direct("retry_job", { job_id: jobId }),
    runQueue: () => direct("run_queue", {}),
    pauseQueue: () => direct("pause_queue", {}),
    resumeQueue: () => direct("resume_queue", {}),
    dispose: () => {
      subscriptions.clear();
      for (const hass of hassBindings) delete hass.callWS;
    },
    calls,
    get failures() {
      return [...failures];
    },
  };

  const initial = seed || {};
  for (const robot of initial.robots || (profile === "target" ? [defaultRobot()] : [])) robots.push(copy(robot));
  for (const area of initial.areas || (profile === "target" ? ["kitchen", "hall", "bathroom"].map(defaultArea) : [])) {
    const record = typeof area === "string" ? defaultArea(area) : copy(area);
    if (record.area_id) areas.set(record.area_id, record);
  }
  const seededJobs = initial.jobs || initial.queue || [];
  for (const value of seededJobs) {
    const id = value.job_id || `job-${++jobCounter}`;
    const job = defaultJob(virtualClock, id, value, value.revision || 1);
    job.state = value.state || "queued";
    jobs.set(id, job);
    if (job.state === "queued") queue.push(id);
  }
  if (Array.isArray(initial.queue)) {
    queue.splice(0, queue.length, ...initial.queue.map((item) => (typeof item === "string" ? item : item.job_id)).filter((id) => jobs.has(id)));
  }

  return Object.freeze(api);
}

module.exports = { createFakeOrchestrator, VirtualClock, BASE_CAPABILITIES, TARGET_CAPABILITIES };
