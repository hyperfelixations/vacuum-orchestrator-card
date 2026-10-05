// A deterministic stand-in for Vacuum Orchestrator API V2 behind Home Assistant's frontend
// connection. Shapes come from test/fixtures/voi/wire.js; preconditions and error codes follow
// the integration's command handlers, and errors travel in Home Assistant's own frames
// (`service_validation_error` for actions, the VOI code for its WebSocket types). It holds no
// scheduler: a test moves jobs between states explicitly. Loads in Node through `require` and in
// the browser harness as a plain script (`globalThis.VocFake`).
(function (root) {
  "use strict";

  const W = typeof module !== "undefined" && module.exports ? require("../fixtures/voi/wire.js") : root.VocWire;
  const { EXCEPTIONS } = typeof module !== "undefined" && module.exports ? require("../fixtures/voi/exceptions.js") : root.VocExceptions;
  const DOMAIN = "vacuum_orchestrator";
  const ACTIONS = ["create_job", "update_job", "delete_job", "move_job", "start_job", "cancel_job", "retry_job", "run_queue", "pause_queue", "resume_queue"];
  const QUERY_ACTIONS = ["get_queue", "get_job"];
  const COMMANDS = ["configure_queue", "create_room", "update_room", "remove_room", "release_room", "revoke_room", "add_robot", "configure_robot", "remove_robot", "resolve_recovery", "save_template", "remove_template", "create_job_from_template", "reset_template_demand"];
  const QUERIES = ["get_rooms", "get_room", "get_robots", "get_robot_candidates", "get_templates", "get_history", "get_trace", "get_diagnostics", "get_job_execution"];
  const TERMINAL = new Set(["completed", "failed", "cancelled"]);
  const MODES = { vacuum: "vacuum", vac: "vacuum", mop: "mop", vacuum_and_mop: "vacuum_and_mop", vac_and_mop: "vacuum_and_mop", vacuum_then_mop: "vacuum_then_mop", vac_then_mop: "vacuum_then_mop" };
  const LEVELS = new Set(["off", "low", "standard", "medium", "high", "maximum", "auto"]);
  const ROUTES = new Set(["standard", "deep", "fast", "auto"]);
  const RELEASE_KINDS = new Set(["permanent", "once", "timed", "queue_run"]);

  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  class VirtualClock {
    constructor(now = Date.UTC(2026, 8, 17, 12, 0, 0)) {
      this.time = now;
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
      for (let guard = 0; guard < 10000; guard += 1) {
        let next = null;
        for (const [handle, timer] of this.timers) if (timer.at <= target && (!next || timer.at < next.timer.at)) next = { handle, timer };
        if (!next) break;
        this.time = next.timer.at;
        this.timers.delete(next.handle);
        next.timer.callback();
      }
      this.time = target;
    }
  }

  // Errors as home-assistant-js-websocket rejects them.
  const validation = (code, detail) => W.haError.serviceValidation(code, detail);
  const voi = (code) => W.haError.voi(code);

  function createFakeOrchestrator(options = {}) {
    const clock = options.clock || { now: () => Date.now() };
    const seed = options.seed || {};
    const iso = (offsetMs = 0) => new Date(clock.now() + offsetMs).toISOString().replace("Z", "+00:00");
    let sequence = 0;
    const nextId = (prefix) => `${prefix}-${++sequence}`;

    const state = {
      installed: options.installed !== false,
      setUp: options.setUp !== false,
      runtimeLoaded: options.runtimeLoaded !== false,
      apiVersion: options.apiVersion ?? 2,
      admin: options.admin !== false,
      commitId: seed.commitId ?? 1,
      queueRevision: 1,
      runtimeId: "runtime-1",
      runtimeSequence: 1,
      mode: seed.mode || "idle",
      run: seed.run ? W.wireQueueRun(seed.run) : null,
      graceSeconds: seed.graceSeconds ?? 900,
      recoveryTargets: copy(seed.recoveryTargets || []),
      jobs: new Map(),
      readiness: new Map(),
      queue: [],
      rooms: (seed.rooms || []).map((room) => W.wireRoom(room)),
      robots: (seed.robots || []).map((robot) => W.wireRobot(robot)),
      candidates: (seed.candidates || []).map((candidate) => W.wireCandidate(candidate)),
      templates: (seed.templates || []).map((template) => W.wireTemplate(template)),
      runs: (seed.runs || []).map((run) => W.wireRun(run)),
      trace: (seed.trace || []).map((record) => W.wireTraceRecord(record)),
      execution: copy(seed.execution || {}),
      registry: copy(seed.registry || []),
      latencyMs: options.latencyMs ?? 0,
    };
    for (const job of seed.jobs || []) {
      const wire = W.wireJob(job);
      delete wire.readiness;
      state.jobs.set(wire.job_id, wire);
      if (job.readiness) state.readiness.set(wire.job_id, W.wireReadiness(job.readiness));
      if (wire.state === "queued") state.queue.push(wire.job_id);
    }

    const calls = { ws: [], services: [] };
    const failures = new Map();
    const subscribers = new Set();
    const connectionListeners = { ready: new Set(), disconnected: new Set() };

    function respond(value) {
      if (!state.latencyMs || typeof clock.setTimeout !== "function") return Promise.resolve(copy(value));
      return new Promise((resolve) => clock.setTimeout(() => resolve(copy(value)), state.latencyMs));
    }

    function reject(error) {
      if (!state.latencyMs || typeof clock.setTimeout !== "function") return Promise.reject(error);
      return new Promise((_resolve, rejectLater) => clock.setTimeout(() => rejectLater(error), state.latencyMs));
    }

    function event() {
      return { api_version: 2, commit_id: state.commitId, runtime_id: state.runtimeId, runtime_sequence: state.runtimeSequence, queue_revision: state.queueRevision, mode: state.mode, pending_jobs: state.queue.length, needs_attention: needsAttention() };
    }

    function notify() {
      state.runtimeSequence += 1;
      for (const callback of [...subscribers]) callback(event());
    }

    function commit({ queueChanged = false } = {}) {
      state.commitId += 1;
      if (queueChanged) state.queueRevision += 1;
      notify();
    }

    function needsAttention() {
      return state.recoveryTargets.length > 0 || [...state.jobs.values()].some((job) => job.state === "needs_attention");
    }

    function readinessFor(jobId) {
      return state.readiness.get(jobId) || W.wireReadiness();
    }

    function presentJob(job, withReadiness) {
      const result = copy(job);
      if (withReadiness) result.readiness = copy(readinessFor(job.job_id));
      return result;
    }

    function page(items, { offset = 0, limit = 50 } = {}) {
      return { offset, limit, total: items.length, slice: items.slice(offset, offset + limit) };
    }

    function pageParameters(parameters) {
      const offset = parameters.offset ?? 0;
      const limit = parameters.limit ?? 50;
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
      return { offset, limit };
    }

    function roomFor(reference) {
      return state.rooms.find((room) => room.room_id === reference || room.area_id === reference) || null;
    }

    function jobOrError(jobId) {
      return state.jobs.get(jobId) || null;
    }

    function failure(key) {
      if (!failures.has(key)) return null;
      const error = failures.get(key);
      failures.delete(key);
      return error;
    }

    // ---- WebSocket types -------------------------------------------------------------------

    function queuePage(message) {
      const { offset, limit, total, slice } = page(state.queue, message);
      const base = W.wireQueuePage(slice.map((jobId) => presentJob(state.jobs.get(jobId), true)), {
        commit_id: state.commitId,
        queue_revision: state.queueRevision,
        mode: state.mode,
        needs_attention: needsAttention(),
        recovery_targets: copy(state.recoveryTargets),
        queue_grace_seconds: state.graceSeconds,
        queue_run: copy(state.run),
        total,
        offset,
        limit,
      });
      base.api_version = state.apiVersion;
      return base;
    }

    function jobsList(message) {
      const ordered = [...state.jobs.values()].sort((one, other) => (one.created_at === other.created_at ? (one.job_id < other.job_id ? 1 : -1) : one.created_at < other.created_at ? 1 : -1));
      const { offset, limit, total, slice } = page(ordered, message);
      return W.wireJobListPage(slice.map((job) => presentJob(job, false)), { total, offset, limit });
    }

    function query(name, parameters) {
      const paging = pageParameters(parameters);
      const collection = (key, items) => {
        if (!paging) throw voi("invalid_parameters");
        const { offset, limit, total, slice } = page(items, paging);
        return W.wirePage(key, copy(slice), { total, offset, limit });
      };
      switch (name) {
        case "get_rooms":
          return collection("rooms", state.rooms);
        case "get_room": {
          const room = roomFor(parameters.room_id);
          if (!room) throw voi("unknown_room");
          return { api_version: 2, ...copy(room) };
        }
        case "get_robots":
          return collection("robots", state.robots);
        case "get_robot_candidates":
          return collection("candidates", state.candidates);
        case "get_templates":
          return collection("templates", state.templates);
        case "get_history":
          return collection("runs", state.runs);
        case "get_trace": {
          const records = state.trace.filter((record) => !parameters.job_id || record.job_id === parameters.job_id);
          return { ...collection("records", records), runtime_id: state.runtimeId, trace_sequence: state.trace.length };
        }
        case "get_diagnostics":
          return W.wireDiagnostics({ commit_id: state.commitId, runtime_id: state.runtimeId, runtime_sequence: state.runtimeSequence, mode: state.mode, needs_attention: needsAttention(), totals: { jobs: state.jobs.size, rooms: state.rooms.length }, trace_window: { recorded: state.trace.length, retained: state.trace.length, dropped: 0 } });
        case "get_job_execution": {
          const job = jobOrError(parameters.job_id);
          if (!job) throw voi("unknown_job");
          return W.wireExecution({ job_id: job.job_id, ...(copy(state.execution[job.job_id]) || { robots: state.robots.map((robot) => W.wireExecutionRobot({ robot_id: robot.robot_id, operation: job.mode === "mop" ? "mop" : "vacuum" })), attempts: [] }) });
        }
        default:
          throw voi("invalid_parameters");
      }
    }

    function requireAdmin() {
      if (!state.admin) throw W.haError.unauthorized();
    }

    function command(name, parameters) {
      requireAdmin();
      const result = { api_version: 2 };
      switch (name) {
        case "configure_queue": {
          const value = parameters.grace_seconds;
          if (typeof value !== "number" || value < 0 || value > 86400) throw voi("invalid_parameters");
          state.graceSeconds = value;
          result.grace_seconds = value;
          break;
        }
        case "create_room": {
          if (!parameters.name) throw voi("invalid_parameters");
          const room = W.wireRoom({ room_id: nextId("room"), name: parameters.name, area_id: parameters.area_id ?? null });
          state.rooms.push(room);
          result.room_id = room.room_id;
          break;
        }
        case "update_room": {
          const room = roomFor(parameters.room_id);
          if (!room) throw voi("unknown_room");
          const patch = parameters.configuration || {};
          for (const key of Object.keys(patch)) if (!["name", "area_id", "floor_id", "enabled", "follow_area_name", "bindings", "requirements", "due_policy"].includes(key)) throw voi("invalid_room_configuration");
          if (patch.due_policy) room.due_policy = { ...room.due_policy, ...copy(patch.due_policy) };
          for (const key of ["name", "area_id", "floor_id", "enabled", "follow_area_name", "bindings", "requirements"]) if (key in patch) room[key] = copy(patch[key]);
          if ("name" in patch && !("follow_area_name" in patch)) room.follow_area_name = false;
          if ("area_id" in patch) room.area_missing = false;
          if (room.requirements) room.requirements = room.requirements.map((item) => W.wireRoomRequirement({ entity_registry_id: null, ...item }));
          result.room_id = room.room_id;
          break;
        }
        case "remove_room": {
          const room = roomFor(parameters.room_id);
          if (!room) throw voi("unknown_room");
          room.enabled = false;
          room.released = false;
          result.room_id = room.room_id;
          break;
        }
        case "release_room": {
          const room = roomFor(parameters.room_id);
          if (!room) throw voi("unknown_room");
          if (!RELEASE_KINDS.has(parameters.kind)) throw voi("invalid_parameters");
          if ((parameters.kind === "timed") !== (parameters.duration_seconds !== undefined)) throw voi("release_duration_mismatch");
          if (!room.enabled || room.area_missing) throw voi("room_unavailable");
          room.release = W.wireRelease({ grant_id: nextId("grant"), kind: parameters.kind, granted_at: iso(), expires_at: parameters.kind === "timed" ? iso(parameters.duration_seconds * 1000) : null, queue_run_id: parameters.kind === "queue_run" && state.run?.active ? state.run.run_id : null });
          room.released = true;
          result.room_id = room.room_id;
          result.grant_id = room.release.grant_id;
          break;
        }
        case "revoke_room": {
          const room = roomFor(parameters.room_id);
          if (!room) throw voi("unknown_room");
          room.release = null;
          room.released = false;
          result.room_id = room.room_id;
          break;
        }
        case "add_robot": {
          const configuration = parameters.configuration || {};
          const reference = configuration.robot_entity_id || configuration.robot_registry_id;
          const candidate = state.candidates.find((item) => item.entity_id === reference || item.registry_id === reference);
          if (!candidate) throw voi("entity_not_registered");
          if (state.robots.some((robot) => robot.configuration.robot_registry_id === candidate.registry_id)) throw voi("already_configured");
          if (state.robots.length >= 20) throw voi("robot_limit_reached");
          const robot = W.wireRobot({ robot_id: nextId("robot"), name: candidate.name, configuration: { ...copy(configuration), robot_registry_id: candidate.registry_id, robot_entity_id: candidate.entity_id, adapter: candidate.adapter, roles: copy(candidate.roles), protocol: candidate.protocol, target_areas: [] }, capabilities: { targets: {}, operations: ["vacuum"] } });
          state.robots.push(robot);
          result.robot_id = robot.robot_id;
          break;
        }
        case "configure_robot": {
          const robot = state.robots.find((item) => item.robot_id === parameters.robot_id);
          if (!robot) throw voi("unknown_robot");
          if (robot.active) throw voi("robot_busy");
          const next = { ...robot.configuration, ...copy(parameters.configuration || {}) };
          if (next.robot_registry_id !== robot.configuration.robot_registry_id && next.robot_entity_id !== robot.configuration.robot_entity_id) throw voi("robot_identity_change");
          if (Array.isArray(next.allowed_operations) && next.allowed_operations.length === 0) throw voi("empty_allowed_operations");
          robot.configuration = next;
          result.robot_id = robot.robot_id;
          break;
        }
        case "remove_robot": {
          const index = state.robots.findIndex((item) => item.robot_id === parameters.robot_id);
          if (index < 0) throw voi("unknown_robot");
          if (state.robots[index].active) throw voi("robot_busy");
          state.robots.splice(index, 1);
          result.robot_id = parameters.robot_id;
          break;
        }
        case "resolve_recovery": {
          const index = state.recoveryTargets.findIndex((target) => target.robot_id === parameters.robot_id);
          if (index < 0) throw voi("robot_not_needing_recovery");
          if (parameters.confirm_stopped !== true) throw voi("robot_stopped_confirmation_required");
          state.recoveryTargets.splice(index, 1);
          for (const job of state.jobs.values()) if (job.state === "needs_attention") Object.assign(job, { state: "failed", failure_code: "operator_assumed_stopped", revision: job.revision + 1, updated_at: iso() });
          result.robot_id = parameters.robot_id;
          break;
        }
        case "save_template": {
          if (!parameters.name || !parameters.intent) throw voi("invalid_parameters");
          const intent = copy(parameters.intent);
          const mode = MODES[intent.mode];
          if (!mode || !Array.isArray(intent.areas) || !intent.areas.length) throw voi("invalid_parameters");
          intent.mode = mode;
          intent.passes = intent.passes ?? 1;
          intent.settings_policy = intent.settings_policy ?? "best_effort";
          intent.required_on = intent.required_on ?? [];
          intent.required_off = intent.required_off ?? [];
          const existing = state.templates.find((template) => template.template_id === parameters.template_id);
          const template = W.wireTemplate({ template_id: existing?.template_id || parameters.template_id || nextId("template"), name: parameters.name, intent, enabled: parameters.enabled ?? true, automatic: parameters.automatic ?? false, updated_at: iso(), suppressed_room_ids: existing?.suppressed_room_ids || [] });
          if (existing) Object.assign(existing, template);
          else state.templates.push(template);
          result.template_id = template.template_id;
          break;
        }
        case "remove_template": {
          const index = state.templates.findIndex((template) => template.template_id === parameters.template_id);
          if (index < 0) throw voi("unknown_template");
          state.templates.splice(index, 1);
          result.template_id = parameters.template_id;
          break;
        }
        case "create_job_from_template": {
          const template = state.templates.find((item) => item.template_id === parameters.template_id);
          if (!template) throw voi("unknown_template");
          if (!template.enabled) throw voi("template_disabled");
          result.job_id = createJob(copy(template.intent));
          break;
        }
        case "reset_template_demand": {
          const template = state.templates.find((item) => item.template_id === parameters.template_id);
          if (!template) throw voi("unknown_template");
          template.suppressed_room_ids = [];
          result.template_id = template.template_id;
          break;
        }
        default:
          throw voi("invalid_parameters");
      }
      commit({ queueChanged: name === "create_job_from_template" });
      return result;
    }

    // ---- actions ---------------------------------------------------------------------------

    function createJob(data) {
      const mode = MODES[data.mode];
      if (!Array.isArray(data.areas) || data.areas.length === 0) throw validation("job_requires_area");
      if (!mode) throw validation("invalid_cleaning_mode");
      const rooms = data.areas.map((reference) => roomFor(reference));
      if (rooms.some((room) => !room)) throw validation("unknown_room");
      if ((data.vacuum_power === "off" && mode !== "mop") || (data.mop_intensity === "off" && mode !== "vacuum")) throw validation("preference_conflicts_with_cleaning_mode");
      if (data.dedupe_key && state.queue.some((jobId) => state.jobs.get(jobId).dedupe_key === data.dedupe_key)) throw validation("dedupe_key_already_queued");
      const job = W.wireJob({
        job_id: nextId("job"),
        state: "queued",
        name: data.name ?? null,
        areas: rooms.map((room) => room.area_id || room.room_id),
        room_ids: rooms.map((room) => room.room_id),
        mode,
        vacuum_power: data.vacuum_power ?? null,
        mop_intensity: data.mop_intensity ?? null,
        mop_route: data.mop_route ?? null,
        passes: data.passes ?? 1,
        source: data.source ?? null,
        reason: data.reason ?? null,
        note: data.note ?? null,
        dedupe_key: data.dedupe_key ?? null,
        required_on: data.required_on ?? [],
        required_off: data.required_off ?? [],
        settings_policy: data.settings_policy ?? "best_effort",
        created_at: iso(),
        updated_at: iso(),
      });
      state.jobs.set(job.job_id, job);
      state.queue.push(job.job_id);
      return job.job_id;
    }

    function queued(jobId, code) {
      const job = jobOrError(jobId);
      if (!job) throw validation("unknown_job");
      if (job.state !== "queued") throw validation(code);
      return job;
    }

    function action(service, data) {
      if (!state.admin) throw W.haError.homeAssistant("Unauthorized");
      switch (service) {
        case "create_job": {
          const jobId = createJob(data);
          commit({ queueChanged: true });
          return { job_id: jobId };
        }
        case "update_job": {
          const job = queued(data.job_id, "job_not_editable");
          const patch = { ...data };
          delete patch.job_id;
          if (!Object.keys(patch).length) throw validation("empty_job_update");
          if (patch.mode !== undefined) {
            if (!MODES[patch.mode]) throw validation("invalid_cleaning_mode");
            patch.mode = MODES[patch.mode];
          }
          if (patch.areas) {
            const rooms = patch.areas.map((reference) => roomFor(reference));
            if (rooms.some((room) => !room)) throw validation("unknown_room");
            job.room_ids = rooms.map((room) => room.room_id);
            patch.areas = rooms.map((room) => room.area_id || room.room_id);
          }
          for (const [key, value] of Object.entries(patch)) if (key in job) job[key] = copy(value);
          job.revision += 1;
          job.updated_at = iso();
          commit({ queueChanged: true });
          return { job_id: job.job_id };
        }
        case "delete_job": {
          const job = jobOrError(data.job_id);
          if (!job) throw validation("unknown_job");
          if (job.state !== "queued" && !TERMINAL.has(job.state)) throw validation("job_not_deletable");
          state.jobs.delete(job.job_id);
          state.queue = state.queue.filter((jobId) => jobId !== job.job_id);
          commit({ queueChanged: true });
          return null;
        }
        case "move_job": {
          queued(data.job_id, "job_not_movable");
          const index = state.queue.indexOf(data.job_id);
          const queue = state.queue.filter((jobId) => jobId !== data.job_id);
          const target = { up: Math.max(0, index - 1), down: Math.min(queue.length, index + 1), top: 0, bottom: queue.length }[data.direction];
          if (target === undefined) throw W.haError.invalidFormat();
          queue.splice(target, 0, data.job_id);
          state.queue = queue;
          commit({ queueChanged: true });
          return null;
        }
        case "start_job": {
          const job = queued(data.job_id, "job_not_startable");
          if (!state.robots.length) throw validation("no_robot_configured");
          const robot = data.robot_id ? state.robots.find((item) => item.robot_id === data.robot_id) : state.robots.find((item) => !item.active);
          if (!robot) throw validation(data.robot_id ? "unknown_robot" : "robot_busy");
          if (robot.active) throw validation("robot_busy");
          Object.assign(job, { state: "dispatching", revision: job.revision + 1, updated_at: iso(), active_attempt_id: nextId("attempt") });
          state.queue = state.queue.filter((jobId) => jobId !== job.job_id);
          robot.active = true;
          commit({ queueChanged: true });
          return { job_id: job.job_id, robot_id: robot.robot_id, omitted_preferences: [] };
        }
        case "cancel_job": {
          const job = jobOrError(data.job_id);
          if (!job) throw validation("unknown_job");
          if (job.state === "queued") {
            Object.assign(job, { state: "cancelled", revision: job.revision + 1, updated_at: iso() });
            state.queue = state.queue.filter((jobId) => jobId !== job.job_id);
          } else if (job.state === "dispatching" || job.state === "running") {
            Object.assign(job, { state: "canceling", revision: job.revision + 1, updated_at: iso() });
          } else {
            throw validation("job_not_cancellable");
          }
          commit({ queueChanged: true });
          return null;
        }
        case "retry_job": {
          const job = jobOrError(data.job_id);
          if (!job) throw validation("unknown_job");
          if (!TERMINAL.has(job.state)) throw validation("job_not_retryable");
          const jobId = createJob({ ...copy(job), areas: job.room_ids });
          state.jobs.get(jobId).retries_job_id = job.job_id;
          commit({ queueChanged: true });
          return { job_id: jobId };
        }
        case "run_queue":
        case "resume_queue": {
          state.mode = "running";
          if (!state.run?.active) state.run = W.wireQueueRun({ run_id: nextId("run"), started_at: iso() });
          commit();
          return { dispatched: 0, robot_ids: [] };
        }
        case "pause_queue":
          state.mode = "paused";
          commit();
          return null;
        case "get_queue":
          return queuePage(pageParameters(data) || {});
        case "get_job": {
          const job = jobOrError(data.job_id);
          if (!job) throw validation("unknown_job");
          return presentJob(job, job.state === "queued");
        }
        default:
          throw W.haError.notFound(`Service ${DOMAIN}.${service} not found.`);
      }
    }

    // Home Assistant's frontend translations: the requested language over English, flattened.
    function translations({ language, category, integration }) {
      if (category !== "exceptions" || !state.installed || !(integration || []).includes(DOMAIN)) return { resources: {} };
      const texts = { ...EXCEPTIONS.en, ...(EXCEPTIONS[language] || {}) };
      return { resources: Object.fromEntries(Object.entries(texts).map(([code, text]) => [`component.${DOMAIN}.exceptions.${code}.message`, text])) };
    }

    function handleWs(message) {
      calls.ws.push(copy(message));
      const key = message.type === `${DOMAIN}/configuration/get` ? message.query : message.type === `${DOMAIN}/configuration/command` ? message.command : message.type;
      const injected = failure(key);
      if (injected) return reject(injected);
      if (message.type === "frontend/get_translations") return respond(translations(message));
      if (message.type === "manifest/get") return state.installed && message.integration === DOMAIN ? respond(W.wireManifest()) : reject(W.haError.notFound());
      if (message.type === "config/entity_registry/list") return respond(state.registry);
      if (!message.type.startsWith(`${DOMAIN}/`) || !state.setUp) return reject(W.haError.unknownCommand());
      if (!state.runtimeLoaded) return reject(voi("orchestrator_not_loaded"));
      try {
        switch (message.type) {
          case `${DOMAIN}/queue/get`:
            return respond(queuePage(message));
          case `${DOMAIN}/job/get`: {
            const job = jobOrError(message.job_id);
            return job ? respond(presentJob(job, state.queue.includes(job.job_id))) : reject(voi("unknown_job"));
          }
          case `${DOMAIN}/jobs/list`:
            return respond(jobsList(message));
          case `${DOMAIN}/configuration/get`:
            if (!QUERIES.includes(message.query)) return reject(W.haError.invalidFormat());
            return respond(query(message.query, message.parameters || {}));
          case `${DOMAIN}/configuration/command`:
            if (!COMMANDS.includes(message.command)) return reject(W.haError.invalidFormat());
            return respond(command(message.command, message.parameters || {}));
          default:
            return reject(W.haError.unknownCommand());
        }
      } catch (error) {
        return reject(error);
      }
    }

    function handleService(domain, service, data = {}, _target, _notify, returnResponse = false) {
      calls.services.push({ domain, service, data: copy(data), returnResponse });
      const injected = failure(service);
      if (injected) return reject(injected);
      if (domain !== DOMAIN || !state.setUp || ![...ACTIONS, ...QUERY_ACTIONS, ...COMMANDS, ...QUERIES].includes(service)) return reject(W.haError.notFound(`Service ${domain}.${service} not found.`));
      if (!state.runtimeLoaded) return reject(validation("orchestrator_not_loaded"));
      const supportsResponse = ["create_job", "update_job", "start_job", "retry_job", "run_queue", "resume_queue", ...QUERY_ACTIONS].includes(service);
      if (returnResponse && !supportsResponse) return reject(W.haError.serviceValidation("service_does_not_support_response"));
      try {
        const response = action(service, data);
        return respond(returnResponse ? { context: { id: "context" }, response } : { context: { id: "context" } });
      } catch (error) {
        return reject(error);
      }
    }

    const connection = {
      sendMessagePromise: (message) => handleWs(message),
      subscribeMessage(callback, message) {
        calls.ws.push(copy(message));
        const injected = failure(message.type);
        if (injected) return reject(injected);
        if (!state.setUp) return reject(W.haError.unknownCommand());
        if (!state.runtimeLoaded) return reject(voi("orchestrator_not_loaded"));
        subscribers.add(callback);
        return respond(null).then(() => () => subscribers.delete(callback));
      },
      addEventListener(name, listener) {
        connectionListeners[name]?.add(listener);
      },
      removeEventListener(name, listener) {
        connectionListeners[name]?.delete(listener);
      },
    };

    function services() {
      if (!state.setUp) return {};
      return { [DOMAIN]: Object.fromEntries([...ACTIONS, ...QUERY_ACTIONS, ...COMMANDS, ...QUERIES].map((name) => [name, {}])) };
    }

    const fake = {
      state,
      calls,
      clock,
      // Wires the fake into a hass object: the connection, the action call and the registered
      // services and components that the card reads.
      attachTo(hass) {
        hass.connection = connection;
        hass.callWS = (message) => handleWs(message);
        hass.callService = handleService;
        hass.services = { ...(hass.services || {}), ...services() };
        const components = new Set(hass.config?.components || []);
        if (state.setUp) components.add(DOMAIN);
        hass.config = { ...(hass.config || {}), components: [...components] };
        hass.user = { ...(hass.user || {}), is_admin: state.admin };
        return hass;
      },
      failNext(key, error) {
        failures.set(key, error);
      },
      // A readiness change without a commit: the integration notifies with a new runtime sequence.
      setReadiness(jobId, readiness) {
        state.readiness.set(jobId, W.wireReadiness(readiness));
        notify();
      },
      setJob(jobId, patch) {
        const job = state.jobs.get(jobId);
        Object.assign(job, copy(patch), { revision: job.revision + 1, updated_at: iso() });
        if (job.state !== "queued") state.queue = state.queue.filter((id) => id !== jobId);
        commit({ queueChanged: true });
      },
      // A reloaded config entry: a new runtime, and old subscriptions silently stop.
      reloadRuntime() {
        state.runtimeId = `runtime-${state.runtimeId.split("-")[1] * 1 + 1}`;
        state.runtimeSequence = 1;
        subscribers.clear();
      },
      emitEvent(overrides = {}) {
        for (const callback of [...subscribers]) callback({ ...event(), ...overrides });
      },
      notify,
      commit,
      disconnect() {
        for (const listener of [...connectionListeners.disconnected]) listener();
      },
      reconnect() {
        for (const listener of [...connectionListeners.ready]) listener();
      },
      subscriberCount: () => subscribers.size,
    };
    return fake;
  }

  const api = { createFakeOrchestrator, VirtualClock, DOMAIN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VocFake = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
