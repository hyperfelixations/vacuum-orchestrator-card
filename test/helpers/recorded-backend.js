// Plays a recording of the Vacuum Orchestrator integration (test/fixtures/voi/recordings) behind
// Home Assistant's frontend objects. It holds no rule of the integration: it answers each read
// with what the integration answered to the same request, plays changes in the recorded order
// and builds `hass` as the frontend does from the recorded messages. A request the recording
// does not contain fails the test. See TESTING.md "Recordings". Loads in Node through `require`
// and in the browser harness as a plain script (`globalThis.VocRecorded`).
(function (root) {
  "use strict";

  const DOMAIN = "vacuum_orchestrator";
  // Messages that change the integration; the card must send them in the recorded order.
  const MUTATIONS = new Set(["call_service", `${DOMAIN}/configuration/command`]);
  const SUBSCRIBE = `${DOMAIN}/subscribe`;
  // A connection loss as home-assistant-js-websocket reports it.
  const CONNECTION_LOST = 3;

  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  // A request without its transport id, with object keys sorted: equal requests, equal key.
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  const requestKey = ({ id: _id, ...message }) => canonical(message);

  // `subscribe_entities` states as home-assistant-js-websocket expands them.
  function expandState(entityId, compressed) {
    const lastChanged = new Date(compressed.lc * 1000).toISOString();
    return {
      entity_id: entityId,
      state: compressed.s,
      attributes: compressed.a || {},
      context: typeof compressed.c === "string" ? { id: compressed.c, parent_id: null, user_id: null } : compressed.c ?? { id: "", parent_id: null, user_id: null },
      last_changed: lastChanged,
      last_updated: compressed.lu ? new Date(compressed.lu * 1000).toISOString() : lastChanged,
    };
  }

  // `config/entity_registry/list_for_display` as the frontend turns it into `hass.entities`.
  function displayEntities(response) {
    const entities = {};
    for (const entity of response.entities) {
      entities[entity.ei] = {
        entity_id: entity.ei,
        device_id: entity.di,
        area_id: entity.ai,
        next_name_part: entity.np,
        labels: entity.lb,
        translation_key: entity.tk,
        platform: entity.pl,
        entity_category: entity.ec !== undefined ? response.entity_categories[entity.ec] : undefined,
        has_entity_name: entity.hn,
        name: entity.en,
        icon: entity.ic,
        hidden: entity.hb,
        display_precision: entity.dp,
      };
    }
    return entities;
  }

  // The recording's sends with their answers and the frames that followed until the next step
  // of the recorder.
  function index(recording) {
    const sends = [];
    const byId = new Map();
    recording.steps.forEach((step, position) => {
      if (step.send) {
        const entry = { position, message: step.send, key: requestKey(step.send), mutation: MUTATIONS.has(step.send.type), result: null, resultAt: -1 };
        sends.push(entry);
        byId.set(step.send.id, entry);
      } else if (step.receive?.type === "result") {
        const entry = byId.get(step.receive.id);
        if (entry) Object.assign(entry, { result: step.receive, resultAt: position });
      }
    });
    return { sends, byId };
  }

  // An instant with up to six fractional digits, as the integration writes it, in ms.
  const instantMs = (value) => Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));

  // options: from (a mark: the card opens there), language ("en"), admin (the recorded user's
  // flag), formatEntityState (Home Assistant's state formatter; the frontend owns it), clock
  // (moved by recorded `advance` steps), hassUrl.
  function createRecordedBackend(recording, options = {}) {
    const name = recording.scenario;
    const { sends, byId } = index(recording);
    const calls = [];
    const subscribers = new Map();
    const connectionListeners = { ready: new Set(), disconnected: new Set() };
    const changeListeners = new Set();
    const held = [];
    // Commands the card sent whose answer lies ahead in the recording, by the answer's step.
    const pending = new Map();
    // Frames that arrive in a later task, in recorded order.
    const outbox = [];
    let holding = false;
    let connected = true;
    let cursor = 0;
    // Recorded time passed since `frozen_now`.
    let elapsedMs = 0;
    // The recorded id of the subscription the card holds.
    let subscription = null;

    const view = {
      config: copy(recording.hass.config),
      user: copy(recording.hass.user),
      areas: copy(recording.hass.areas),
      entities: copy(recording.hass.entities),
      services: copy(recording.hass.services),
      states: copy(recording.hass.states),
    };
    let hass = null;

    function fail(message) {
      throw new Error(`${name}: ${message}`);
    }

    function applyHass(change) {
      for (const [key, value] of Object.entries(change)) {
        if (key !== "states") {
          view[key] = copy(value);
          continue;
        }
        for (const [entityId, state] of Object.entries(value.a || {})) view.states[entityId] = copy(state);
        for (const entityId of value.r || []) delete view.states[entityId];
      }
    }

    // A new object on every change, as Home Assistant's frontend hands it out.
    function buildHass() {
      const states = {};
      for (const [entityId, compressed] of Object.entries(view.states)) states[entityId] = expandState(entityId, compressed);
      const language = options.language || "en";
      hass = {
        states,
        entities: displayEntities(view.entities),
        areas: Object.fromEntries(view.areas.map((area) => [area.area_id, area])),
        services: Object.fromEntries(Object.entries(view.services).map(([domain, names]) => [domain, Object.fromEntries(names.map((service) => [service, {}]))])),
        config: { ...view.config },
        user: { ...view.user, ...(options.admin === undefined ? {} : { is_admin: options.admin }) },
        language,
        locale: { language },
        hassUrl: (path = "") => `${options.hassUrl || "http://homeassistant.local:8123"}${path}`,
        connection,
        callWS: (message) => connection.sendMessagePromise(message),
        callService,
      };
      if (typeof options.formatEntityState === "function") hass.formatEntityState = (state) => options.formatEntityState(state, language);
      return hass;
    }

    function changed() {
      buildHass();
      for (const listener of [...changeListeners]) listener(hass);
    }

    function deliver(frame) {
      if (frame.type !== "event") return;
      const callback = subscription !== null && frame.id === subscription ? subscribers.get(subscription) : null;
      callback?.(copy(frame.event));
    }

    // A frame after an answer arrives in a later task, as a separate WebSocket message does, so
    // the card continues after the answer first; frames behind it keep their order.
    function post(frame, later) {
      if (!later && !outbox.length) return deliver(frame);
      if (!outbox.length) setTimeout(() => outbox.splice(0).forEach(deliver), 0);
      outbox.push(frame);
    }

    // Steps from the cursor up to (not including) `end`: home changes, time, events, `hass` and
    // the answers to the card's commands. The recorder's own reads in between are no business of
    // the card.
    function playTo(end) {
      let hassChanged = false;
      let answered = false;
      for (; cursor < end; cursor += 1) {
        const step = recording.steps[cursor];
        if (step.send?.type && MUTATIONS.has(step.send.type)) fail(`the card has not sent ${JSON.stringify(step.send)} yet`);
        if (step.hass) {
          applyHass(step.hass);
          hassChanged = true;
        } else if (step.advance !== undefined) {
          if (hassChanged) changed();
          hassChanged = false;
          elapsedMs += step.advance * 1000;
          options.clock?.advance?.(step.advance * 1000);
        } else if (pending.has(cursor)) {
          pending.get(cursor).settle();
          pending.delete(cursor);
          answered = true;
        } else if (step.receive) {
          post(step.receive, answered);
        }
      }
      if (hassChanged) changed();
    }

    // The next step of the recording that the card or the test has to cause.
    function nextCause(from) {
      for (let position = from; position < recording.steps.length; position += 1) {
        const step = recording.steps[position];
        if (step.home !== undefined || (step.send && MUTATIONS.has(step.send.type))) return position;
      }
      return recording.steps.length;
    }

    // Where the current stretch of the recording ends: at the next cause or passing time.
    function nextBoundary(from) {
      const cause = nextCause(from);
      for (let position = from; position < cause; position += 1) if (recording.steps[position].advance !== undefined) return position;
      return cause;
    }

    const reject = (frame) => Promise.reject(copy(frame.error));
    const answer = (frame) => (frame.success ? Promise.resolve(copy(frame.result)) : reject(frame));

    function settle(response) {
      if (!connected) return Promise.reject(CONNECTION_LOST);
      if (!holding) return response();
      return new Promise((resolve, rejectHeld) => held.push({ response, resolve, reject: rejectHeld }));
    }

    // The integration's answer as the recorder read it last in this stretch of the recording;
    // before the recorder's first read of it, its first answer.
    function read(message) {
      const key = requestKey(message);
      const recorded = sends.filter((entry) => entry.key === key && entry.result);
      if (!recorded.length) fail(`the recording has no ${canonical(message)}; record it in the integration's scenario "${name}"`);
      const bound = nextBoundary(cursor);
      const before = recorded.filter((entry) => entry.position < bound);
      return answer((before.length ? before[before.length - 1] : recorded[0]).result);
    }

    // The card's next command as recorded: what happened up to it plays first, then the rest of
    // its stretch. The answer arrives where the recording has it: within the stretch at once,
    // after a later home change once that is played, never if the integration never answered.
    function mutate(message) {
      const key = requestKey(message);
      const next = sends.find((entry) => entry.mutation && entry.position >= cursor);
      if (!next || next.key !== key) fail(`the card sent ${canonical(message)} but the recording continues with ${next ? canonical(next.message) : "nothing"}`);
      playTo(next.position);
      cursor = next.position + 1;
      const answered = new Promise((resolve, rejectAnswer) => {
        if (next.result) pending.set(next.resultAt, { settle: () => answer(next.result).then(resolve, rejectAnswer), reject: rejectAnswer });
      });
      playTo(nextBoundary(cursor));
      return answered;
    }

    function send(message) {
      calls.push(copy({ ...message, id: undefined }));
      return settle(() => (MUTATIONS.has(message.type) ? mutate(message) : read(message)));
    }

    function callService(domain, service, serviceData, target, _notify, returnResponse) {
      const message = { type: "call_service", domain, service, service_data: serviceData ?? {} };
      if (target !== undefined) message.target = target;
      if (returnResponse) message.return_response = true;
      return send(message);
    }

    const connection = {
      sendMessagePromise: (message) => send(message),
      subscribeMessage(callback, message) {
        if (message.type !== SUBSCRIBE) fail(`unexpected subscription ${canonical(message)}`);
        calls.push(copy({ ...message, id: undefined }));
        const recorded = sends.find((entry) => entry.key === requestKey(message));
        if (!recorded) fail(`the recording has no ${SUBSCRIBE}`);
        return settle(() => answer(recorded.result).then(() => {
          subscription = recorded.message.id;
          subscribers.set(subscription, callback);
          return () => subscribers.delete(subscription);
        }));
      },
      addEventListener(eventName, listener) {
        connectionListeners[eventName]?.add(listener);
      },
      removeEventListener(eventName, listener) {
        connectionListeners[eventName]?.delete(listener);
      },
    };

    // A card opened at a mark finds the home and the time of that point and nothing to answer.
    if (options.from !== undefined) {
      const at = recording.steps.findIndex((step) => step.mark === options.from);
      if (at === -1) fail(`no mark "${options.from}"`);
      for (const step of recording.steps.slice(0, at)) {
        if (step.hass) applyHass(step.hass);
        else if (step.advance !== undefined) elapsedMs += step.advance * 1000;
      }
      cursor = at + 1;
    }
    buildHass();

    return {
      get hass() {
        return hass;
      },
      calls,
      // The step index the recording has been played to.
      get position() {
        return cursor;
      },
      // The recording's time at that point.
      get nowMs() {
        return instantMs(recording.provenance.frozen_now) + elapsedMs;
      },
      onChange(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
      },
      // Play through the home change described by `change` and what followed it, up to the next
      // change in the home or the card's next recorded command.
      until(change) {
        const position = recording.steps.findIndex((step, at) => at >= cursor && step.home === change);
        if (position === -1) fail(`no home change "${change}" ahead`);
        playTo(position);
        cursor = position + 1;
        playTo(nextCause(cursor));
      },
      // Play what follows without a cause of the card or the home: time passing, events.
      play() {
        playTo(nextCause(cursor));
      },
      // Whether the card sent every recorded command.
      get finished() {
        return !sends.some((entry) => entry.mutation && entry.position >= cursor);
      },
      // Answers wait until `release()`, as if the integration were slow.
      hold() {
        holding = true;
        return () => {
          holding = false;
          for (const entry of held.splice(0)) entry.response().then(entry.resolve, entry.reject);
        };
      },
      disconnect() {
        connected = false;
        for (const entry of held.splice(0)) entry.reject(CONNECTION_LOST);
        for (const entry of pending.values()) entry.reject(CONNECTION_LOST);
        pending.clear();
        outbox.length = 0;
        for (const listener of [...connectionListeners.disconnected]) listener();
      },
      reconnect() {
        connected = true;
        for (const listener of [...connectionListeners.ready]) listener();
      },
      // The recorded message id of a send, for tests that look into the recording.
      recorded: (id) => byId.get(id)?.message ?? null,
    };
  }

  const api = { createRecordedBackend, canonical };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VocRecorded = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
